// Poll periódico: busca novas mensagens recebidas via Evolution API
// e popula o CRM (cria conversa + mensagem inbound). Dispara fluxos
// com gatilho first_inbound/keyword. Idempotente via unique index em
// (user_id, evolution_message_id).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function j(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractMsg(m: any) {
  const key = m.key || {};
  // WhatsApp pode usar LID (Linked Identifier) — nesse caso o telefone real
  // vem em `remoteJidAlt`. Preferir o JID @s.whatsapp.net real.
  const remoteJidRaw: string = key.remoteJid || m.remoteJid || "";
  const remoteJidAlt: string = key.remoteJidAlt || "";
  const realJid = remoteJidAlt.endsWith("@s.whatsapp.net")
    ? remoteJidAlt
    : remoteJidRaw;
  // Só importar mensagens privadas (@s.whatsapp.net). Ignorar grupos (@g.us),
  // status (status@broadcast), newsletters, LIDs sem alt etc.
  const isUserChat = realJid.endsWith("@s.whatsapp.net");
  let phone = isUserChat ? realJid.replace(/@.*/, "").replace(/\D/g, "") : "";
  // Garantir DDI brasileiro: se vier só com 10–11 dígitos (DDD+número), prefixar 55
  if (phone && (phone.length === 10 || phone.length === 11)) {
    phone = "55" + phone;
  }
  const msg = m.message || {};
  let type = "text";
  let body: string | null = null;
  let mediaMime: string | null = null;
  let mediaFilename: string | null = null;
  if (msg.conversation || msg.extendedTextMessage) {
    body = msg.conversation || msg.extendedTextMessage?.text || "";
  } else if (msg.imageMessage) { type = "image"; body = msg.imageMessage.caption || null; mediaMime = msg.imageMessage.mimetype; }
  else if (msg.audioMessage) { type = "audio"; mediaMime = msg.audioMessage.mimetype; }
  else if (msg.videoMessage) { type = "video"; body = msg.videoMessage.caption || null; mediaMime = msg.videoMessage.mimetype; }
  else if (msg.documentMessage) { type = "document"; body = msg.documentMessage.caption || null; mediaMime = msg.documentMessage.mimetype; mediaFilename = msg.documentMessage.fileName; }
  else if (msg.buttonsResponseMessage) { type = "button"; body = msg.buttonsResponseMessage.selectedDisplayText || msg.buttonsResponseMessage.selectedButtonId; }
  else { body = "[mensagem não suportada]"; }
  return {
    phone,
    isUserChat,
    contactName: m.pushName || null,
    type,
    body,
    mediaMime,
    mediaFilename,
    evoId: key.id || m.id || null,
    fromMe: !!key.fromMe,
    ts: Number(m.messageTimestamp || 0) * 1000,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfgRow } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "evolution_api")
      .maybeSingle();
    const cfg: any = cfgRow?.setting_value;
    if (!cfg?.api_url || !cfg?.api_key) return j({ ok: true, skipped: "no_evolution_config" });
    const baseUrl = String(cfg.api_url).replace(/\/+$/, "");
    const headers = { apikey: cfg.api_key, "Content-Type": "application/json" };

    const { data: instances } = await admin
      .from("user_whatsapp_instances")
      .select("*");

    let totalProcessed = 0;
    const results: any[] = [];

    for (const inst of instances || []) {
      const userId = inst.user_id;
      const sinceMs = inst.last_poll_at
        ? new Date(inst.last_poll_at).getTime()
        : Date.now() - 15 * 60_000; // primeiros 15min na primeira execução
      const nowIso = new Date().toISOString();

      try {
        // Evolution: POST /chat/findMessages/{instance}
        const r = await fetch(
          `${baseUrl}/chat/findMessages/${encodeURIComponent(inst.instance_name)}`,
          { method: "POST", headers, body: JSON.stringify({ where: {} }) },
        );
        if (!r.ok) {
          results.push({ instance: inst.instance_name, error: `http_${r.status}` });
          continue;
        }
        const raw = await r.json().catch(() => ([]));
        const list: any[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.messages?.records) ? raw.messages.records
          : Array.isArray(raw?.records) ? raw.records
          : Array.isArray(raw?.data) ? raw.data : [];
        console.log(`[poll ${inst.instance_name}] findMessages returned ${list.length} records, sinceMs=${sinceMs}`);
        if (list.length > 0) {
          console.log(`[poll ${inst.instance_name}] sample`, JSON.stringify(list[0]).slice(0, 800));
        }

        let processed = 0;
        for (const m of list) {
          const x = extractMsg(m);
          if (!x.isUserChat || !x.phone || x.fromMe) continue;
          // Telefones válidos no WhatsApp têm 10–15 dígitos (E.164)
          if (x.phone.length < 10 || x.phone.length > 15) continue;
          if (x.ts && x.ts < sinceMs) continue;
          if (!x.evoId) continue;

          // Dedupe rápido
          const { data: existing } = await admin
            .from("crm_messages")
            .select("id")
            .eq("user_id", userId)
            .eq("evolution_message_id", x.evoId)
            .maybeSingle();
          if (existing) continue;

          // Conversa
          let { data: conv } = await admin
            .from("crm_conversations")
            .select("*")
            .eq("user_id", userId)
            .eq("phone", x.phone)
            .maybeSingle();

          let isFirst = false;
          if (!conv) {
            const { data: pipe } = await admin
              .from("crm_pipelines").select("id")
              .eq("user_id", userId).eq("is_default", true).maybeSingle();
            let pipelineId = pipe?.id || null;
            if (!pipelineId) {
              const { data: pid } = await admin.rpc("crm_seed_default_pipeline", { _user_id: userId });
              pipelineId = pid as any;
            }
            let stageId: string | null = null;
            if (pipelineId) {
              const { data: st } = await admin
                .from("crm_stages").select("id")
                .eq("pipeline_id", pipelineId)
                .order("sort_order").limit(1).maybeSingle();
              stageId = st?.id || null;
            }
            const { data: newConv } = await admin
              .from("crm_conversations")
              .insert({
                user_id: userId, phone: x.phone, contact_name: x.contactName,
                pipeline_id: pipelineId, stage_id: stageId,
                last_message_at: new Date(x.ts || Date.now()).toISOString(),
                last_message_preview: (x.body || `[${x.type}]`).slice(0, 120),
                unread_count: 1,
              })
              .select().single();
            conv = newConv;
            isFirst = true;
          } else {
            await admin.from("crm_conversations").update({
              last_message_at: new Date(x.ts || Date.now()).toISOString(),
              last_message_preview: (x.body || `[${x.type}]`).slice(0, 120),
              unread_count: (conv.unread_count || 0) + 1,
              contact_name: conv.contact_name || x.contactName,
              status: conv.status === "snoozed" ? "open" : conv.status,
            }).eq("id", conv.id);
          }
          if (!conv) continue;

          if (x.body && /^(PARAR|SAIR|STOP|UNSUBSCRIBE)$/i.test(x.body.trim())) {
            await admin.from("crm_conversations")
              .update({ opted_out: true, status: "closed" }).eq("id", conv.id);
          }

          const { error: insErr } = await admin.from("crm_messages").insert({
            conversation_id: conv.id,
            user_id: userId,
            direction: "in",
            type: x.type,
            body: x.body,
            media_mime: x.mediaMime,
            media_filename: x.mediaFilename,
            evolution_message_id: x.evoId,
            status: "delivered",
          });
          if (insErr) {
            // race com webhook — index único derruba duplicata; ignorar
            if (!String(insErr.message || "").includes("duplicate")) {
              console.error("insert msg error", insErr);
            }
            continue;
          }

          // Disparar fluxos
          try {
            const { data: flows } = await admin
              .from("crm_flows").select("*")
              .eq("user_id", userId).eq("is_active", true);
            for (const f of flows || []) {
              const trig: any = f.trigger || {};
              let match = false;
              if (trig.type === "first_inbound" && isFirst) match = true;
              if (trig.type === "keyword" && x.body && trig.keyword &&
                  x.body.toLowerCase().includes(String(trig.keyword).toLowerCase())) match = true;
              if (match) {
                await admin.from("crm_flow_runs").insert({
                  flow_id: f.id, user_id: userId, conversation_id: conv.id,
                  current_step_index: 0, status: "running",
                  next_run_at: new Date().toISOString(),
                  context: { trigger_body: x.body },
                });
              }
            }
          } catch (e) { console.error("flow trigger error", e); }

          processed++;
        }

        await admin.from("user_whatsapp_instances")
          .update({ last_poll_at: nowIso }).eq("id", inst.id);

        totalProcessed += processed;
        results.push({ instance: inst.instance_name, processed });
      } catch (e) {
        console.error("poll instance error", inst.instance_name, e);
        results.push({ instance: inst.instance_name, error: String(e) });
      }
    }

    return j({ ok: true, totalProcessed, results });
  } catch (e) {
    console.error("crm-poll-messages fatal", e);
    return j({ ok: false, error: String(e) }, 500);
  }
});