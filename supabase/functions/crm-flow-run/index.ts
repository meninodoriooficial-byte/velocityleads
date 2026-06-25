// Executor de fluxos do CRM. Público (chamado por pg_cron) — autorizado via header X-Cron-Secret.
// Processa runs em status 'running' com next_run_at <= now().
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const TAG_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;
function renderTags(s: string, ctx: Record<string, any>) {
  return (s || "").replace(TAG_RE, (_, k) => (ctx[k.toLowerCase()] ?? "") as string);
}

async function urlToBase64(url: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) { console.error("download media failed", r.status, url); return null; }
    const mime = r.headers.get("content-type") || "application/octet-stream";
    const buf = new Uint8Array(await r.arrayBuffer());
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < buf.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, Math.min(i + CHUNK, buf.length))));
    }
    return { b64: btoa(binary), mime };
  } catch (e) { console.error("download media err", e); return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Config Evolution
    const { data: cfgRow } = await admin
      .from("system_settings").select("setting_value").eq("setting_key", "evolution_api").maybeSingle();
    const cfg: any = cfgRow?.setting_value || {};
    const baseUrl = cfg.api_url ? String(cfg.api_url).replace(/\/+$/, "") : null;
    const evoHeaders = { apikey: cfg.api_key, "Content-Type": "application/json" };

    const { data: runs } = await admin
      .from("crm_flow_runs")
      .select("*, crm_flows(*), crm_conversations(*)")
      .eq("status", "running")
      .lte("next_run_at", new Date().toISOString())
      .limit(50);

    let processed = 0;
    for (const run of runs || []) {
      const flow: any = (run as any).crm_flows;
      const conv: any = (run as any).crm_conversations;
      if (!flow || !conv || conv.opted_out) {
        await admin.from("crm_flow_runs").update({ status: "failed", error: "flow/conv missing or opted_out" }).eq("id", run.id);
        continue;
      }
      const steps: any[] = Array.isArray(flow.steps) ? flow.steps : [];
      let idx = run.current_step_index || 0;
      const ctx: Record<string, any> = { nome: conv.contact_name || "", telefone: conv.phone, ...(run.context || {}) };

      // Executa passos até encontrar wait/end ou fim
      while (idx < steps.length) {
        const step = steps[idx];
        try {
          if (step.type === "send_message" && baseUrl) {
            const { data: inst } = await admin.from("user_whatsapp_instances").select("instance_name").eq("user_id", run.user_id).maybeSingle();
            if (inst?.instance_name) {
              const text = renderTags(String(step.text || ""), ctx);
              const attachments: any[] = Array.isArray(step.attachments) ? step.attachments : [];
              const instName = encodeURIComponent(inst.instance_name);
              let anySent = false;
              let lastPreview = text;

              // 1) Texto (se houver)
              if (text.trim()) {
                const r = await fetch(`${baseUrl}/message/sendText/${instName}`, {
                  method: "POST", headers: evoHeaders,
                  body: JSON.stringify({ number: conv.phone, text }),
                });
                const ok = r.ok;
                anySent ||= ok;
                await admin.from("crm_messages").insert({
                  conversation_id: conv.id, user_id: run.user_id,
                  direction: "out", type: "text", body: text,
                  status: ok ? "sent" : "failed",
                });
              }

              // 2) Anexos
              for (const a of attachments) {
                const url = a?.url; if (!url) continue;
                const dl = await urlToBase64(url);
                if (!dl) {
                  console.error("flow attach skipped (download failed)", url);
                  await admin.from("crm_messages").insert({
                    conversation_id: conv.id, user_id: run.user_id,
                    direction: "out", type: "document", body: "",
                    media_url: url, media_mime: String(a?.mime || ""), media_filename: a?.name || "arquivo",
                    status: "failed",
                  });
                  continue;
                }
                const mime = String(a?.mime || dl.mime || "");
                const fileName = a?.name || "arquivo";
                let endpoint = "sendMedia";
                let payload: any;
                let msgType: "image" | "video" | "audio" | "document" = "document";
                if (mime.startsWith("image/")) {
                  msgType = "image";
                  payload = { number: conv.phone, mediatype: "image", mimetype: mime, media: dl.b64, fileName };
                } else if (mime.startsWith("video/")) {
                  msgType = "video";
                  payload = { number: conv.phone, mediatype: "video", mimetype: mime, media: dl.b64, fileName };
                } else if (mime.startsWith("audio/")) {
                  msgType = "audio";
                  endpoint = "sendWhatsAppAudio";
                  payload = { number: conv.phone, audio: dl.b64 };
                } else {
                  msgType = "document";
                  payload = { number: conv.phone, mediatype: "document", mimetype: mime || "application/octet-stream", media: dl.b64, fileName };
                }
                const r = await fetch(`${baseUrl}/message/${endpoint}/${instName}`, {
                  method: "POST", headers: evoHeaders, body: JSON.stringify(payload),
                });
                const ok = r.ok;
                anySent ||= ok;
                if (!ok) console.error("flow attach failed", endpoint, await r.text().catch(() => ""));
                await admin.from("crm_messages").insert({
                  conversation_id: conv.id, user_id: run.user_id,
                  direction: "out", type: msgType, body: "",
                  media_url: url, media_mime: mime, media_filename: fileName,
                  status: ok ? "sent" : "failed",
                });
                if (!text.trim()) lastPreview = `[${msgType}] ${fileName}`;
              }

              await admin.from("crm_conversations").update({
                last_message_at: new Date().toISOString(),
                last_message_preview: lastPreview.slice(0, 120),
              }).eq("id", conv.id);
              // incrementa cota
              const { data: addon } = await admin.from("user_addons").select("*").eq("user_id", run.user_id).eq("addon_slug", "whatsapp_crm").maybeSingle();
              if (addon && anySent) await admin.from("user_addons").update({ monthly_used: (addon.monthly_used || 0) + 1 }).eq("id", addon.id);
            }
          } else if (step.type === "wait") {
            const minutes = Number(step.minutes || step.hours * 60 || 0);
            const nextAt = new Date(Date.now() + minutes * 60_000).toISOString();
            await admin.from("crm_flow_runs").update({ current_step_index: idx + 1, next_run_at: nextAt }).eq("id", run.id);
            idx = -1; // sai do loop
            break;
          } else if (step.type === "move_stage" && step.stage_name) {
            const { data: stage } = await admin.from("crm_stages").select("id").eq("user_id", run.user_id).ilike("name", step.stage_name).maybeSingle();
            if (stage) await admin.from("crm_conversations").update({ stage_id: stage.id }).eq("id", conv.id);
          } else if (step.type === "add_tag" && step.tag) {
            const tags = Array.from(new Set([...(conv.tags || []), String(step.tag)]));
            await admin.from("crm_conversations").update({ tags }).eq("id", conv.id);
          } else if (step.type === "end") {
            await admin.from("crm_flow_runs").update({ status: "completed", current_step_index: idx + 1, next_run_at: null }).eq("id", run.id);
            idx = -2;
            break;
          }
        } catch (e) {
          console.error("step error", e);
        }
        idx++;
      }

      if (idx >= steps.length) {
        await admin.from("crm_flow_runs").update({ status: "completed", current_step_index: steps.length, next_run_at: null }).eq("id", run.id);
      }
      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("crm-flow-run error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});