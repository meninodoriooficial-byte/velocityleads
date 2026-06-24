// Receptor público de eventos da Evolution API.
// Identifica o usuário pela instância e registra mensagens inbound no CRM.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const payload = await req.json().catch(() => ({}));
    console.log("evolution-webhook", JSON.stringify(payload).slice(0, 1500));

    const event = payload.event || payload.type;
    const instanceName = payload.instance || payload?.data?.instance;

    if (!instanceName) return j({ ok: true, ignored: "no_instance" });

    // Localizar o dono da instância
    const { data: inst } = await admin
      .from("user_whatsapp_instances")
      .select("*")
      .eq("instance_name", instanceName)
      .maybeSingle();
    if (!inst) return j({ ok: true, ignored: "instance_not_found" });
    const userId = inst.user_id;

    // Connection state
    if (event === "connection.update" || payload?.data?.state) {
      const state = payload?.data?.state || payload?.state;
      if (state) {
        await admin.from("user_whatsapp_instances").update({
          connection_state: state,
          connected_at: state === "open" ? new Date().toISOString() : inst.connected_at,
        }).eq("id", inst.id);
      }
      return j({ ok: true, state });
    }

    // Mensagens
    const msgs = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];
    let processed = 0;

    for (const m of msgs) {
      const key = m.key || {};
      if (key.fromMe) continue; // ignorar mensagens enviadas pelo próprio usuário
      const remoteJid: string = key.remoteJid || "";
      const phone = remoteJid.replace(/@.*/, "").replace(/\D/g, "");
      if (!phone) continue;

      const contactName = m.pushName || null;
      const msg = m.message || {};
      let type = "text";
      let body: string | null = null;
      let mediaMime: string | null = null;
      let mediaFilename: string | null = null;

      if (msg.conversation || msg.extendedTextMessage) {
        type = "text";
        body = msg.conversation || msg.extendedTextMessage?.text || "";
      } else if (msg.imageMessage) { type = "image"; body = msg.imageMessage.caption || null; mediaMime = msg.imageMessage.mimetype; }
      else if (msg.audioMessage)  { type = "audio"; mediaMime = msg.audioMessage.mimetype; }
      else if (msg.videoMessage)  { type = "video"; body = msg.videoMessage.caption || null; mediaMime = msg.videoMessage.mimetype; }
      else if (msg.documentMessage) { type = "document"; body = msg.documentMessage.caption || null; mediaMime = msg.documentMessage.mimetype; mediaFilename = msg.documentMessage.fileName; }
      else if (msg.buttonsResponseMessage) { type = "button"; body = msg.buttonsResponseMessage.selectedDisplayText || msg.buttonsResponseMessage.selectedButtonId; }
      else { type = "text"; body = "[mensagem não suportada]"; }

      // Conversa
      let { data: conv } = await admin
        .from("crm_conversations")
        .select("*")
        .eq("user_id", userId)
        .eq("phone", phone)
        .maybeSingle();

      let isFirst = false;
      if (!conv) {
        // Buscar pipeline padrão e primeiro estágio
        const { data: pipe } = await admin
          .from("crm_pipelines")
          .select("id")
          .eq("user_id", userId)
          .eq("is_default", true)
          .maybeSingle();
        let pipelineId = pipe?.id || null;
        let stageId: string | null = null;
        if (pipelineId) {
          const { data: st } = await admin
            .from("crm_stages")
            .select("id")
            .eq("pipeline_id", pipelineId)
            .order("sort_order")
            .limit(1)
            .maybeSingle();
          stageId = st?.id || null;
        }
        const { data: newConv } = await admin
          .from("crm_conversations")
          .insert({
            user_id: userId, phone, contact_name: contactName,
            pipeline_id: pipelineId, stage_id: stageId,
            last_message_at: new Date().toISOString(),
            last_message_preview: (body || `[${type}]`).slice(0, 120),
            unread_count: 1,
          })
          .select()
          .single();
        conv = newConv;
        isFirst = true;
      } else {
        await admin
          .from("crm_conversations")
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: (body || `[${type}]`).slice(0, 120),
            unread_count: (conv.unread_count || 0) + 1,
            contact_name: conv.contact_name || contactName,
            status: conv.status === "snoozed" ? "open" : conv.status,
          })
          .eq("id", conv.id);
      }

      if (!conv) continue;

      // Opt-out
      if (body && /^(PARAR|SAIR|STOP|UNSUBSCRIBE)$/i.test(body.trim())) {
        await admin.from("crm_conversations").update({ opted_out: true, status: "closed" }).eq("id", conv.id);
      }

      await admin.from("crm_messages").insert({
        conversation_id: conv.id,
        user_id: userId,
        direction: "in",
        type,
        body,
        media_mime: mediaMime,
        media_filename: mediaFilename,
        evolution_message_id: key.id || null,
        status: "delivered",
      });

      // Disparar fluxos com gatilho first_inbound ou keyword
      try {
        const { data: flows } = await admin
          .from("crm_flows")
          .select("*")
          .eq("user_id", userId)
          .eq("is_active", true);
        for (const f of flows || []) {
          const trig: any = f.trigger || {};
          let match = false;
          if (trig.type === "first_inbound" && isFirst) match = true;
          if (trig.type === "keyword" && body && trig.keyword && body.toLowerCase().includes(String(trig.keyword).toLowerCase())) match = true;
          if (match) {
            await admin.from("crm_flow_runs").insert({
              flow_id: f.id,
              user_id: userId,
              conversation_id: conv.id,
              current_step_index: 0,
              status: "running",
              next_run_at: new Date().toISOString(),
              context: { trigger_body: body },
            });
          }
        }
      } catch (e) { console.error("flow trigger error", e); }

      processed++;
    }

    return j({ ok: true, processed });
  } catch (e) {
    console.error("evolution-webhook error", e);
    return j({ ok: false, error: String(e) });
  }
});

function j(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}