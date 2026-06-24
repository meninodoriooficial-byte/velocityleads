// Edge function de WhatsApp por usuário (add-on).
// Ações: status | create | connect | state | send
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: u } = await userClient.auth.getUser();
    const user = u?.user;
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verifica add-on ativo
    const { data: addon } = await admin
      .from("user_addons")
      .select("*")
      .eq("user_id", user.id)
      .eq("addon_slug", "whatsapp")
      .eq("status", "active")
      .maybeSingle();
    if (!addon) return json({ ok: false, error: "Add-on WhatsApp não ativo" }, 403);

    // Lê config Evolution global
    const { data: cfgRow } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "evolution_api")
      .maybeSingle();
    const cfg: any = cfgRow?.setting_value;
    if (!cfg?.api_url || !cfg?.api_key) {
      return json({ ok: false, error: "Evolution API não configurada pelo administrador" }, 400);
    }

    const baseUrl = String(cfg.api_url).replace(/\/+$/, "");
    const headers = { apikey: cfg.api_key, "Content-Type": "application/json" };

    // Instância vinculada ao usuário
    let { data: inst } = await admin
      .from("user_whatsapp_instances")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";

    async function ensureInstanceRecord(name: string) {
      if (!inst) {
        const { data: created } = await admin
          .from("user_whatsapp_instances")
          .insert({ user_id: user.id, instance_name: name })
          .select()
          .single();
        inst = created as any;
      }
    }

    if (action === "status") {
      if (!inst) return json({ ok: true, instance: null });
      const r = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(inst.instance_name)}`, { headers });
      const t = await r.text();
      let p: any = null; try { p = JSON.parse(t); } catch {}
      const state = p?.instance?.state || p?.state || (r.status === 404 ? "not_found" : "unknown");

      let profile: any = null;
      if (state === "open") {
        try {
          const fr = await fetch(`${baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(inst.instance_name)}`, { headers });
          const ft = await fr.text();
          let fp: any = null; try { fp = JSON.parse(ft); } catch {}
          const item = Array.isArray(fp) ? fp[0] : (fp?.instance || fp);
          const raw = item?.instance || item || {};
          profile = {
            name: raw.profileName || raw.profile_name || raw.ownerName || null,
            picture: raw.profilePictureUrl || raw.profilePicUrl || raw.profile_pic_url || null,
            number: (raw.owner || raw.ownerJid || raw.wuid || "").toString().split("@")[0] || null,
          };
        } catch (e) { console.error("fetchInstances failed", e); }
      }

      await admin
        .from("user_whatsapp_instances")
        .update({ connection_state: state, connected_at: state === "open" ? new Date().toISOString() : inst.connected_at })
        .eq("id", inst.id);
      return json({ ok: true, instance: inst, state, connected: state === "open", profile });
    }

    if (action === "create") {
      const desired = (body.instance_name || `user_${user.id.slice(0, 8)}`).toString().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const name = desired || `user_${user.id.slice(0, 8)}`;
      await ensureInstanceRecord(name);
      const r = await fetch(`${baseUrl}/instance/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({ instanceName: name, integration: "WHATSAPP-BAILEYS", qrcode: true }),
      });
      const t = await r.text();
      let p: any = null; try { p = JSON.parse(t); } catch {}
      const exists = r.status === 403 || r.status === 409 || /already in use|already exists/i.test(t);
      if (!r.ok && !exists) {
        return json({ ok: false, status: r.status, error: p?.message || p?.response?.message || t.slice(0, 400) });
      }
      const qr = p?.qrcode?.base64 || p?.qrcode || null;
      await admin
        .from("user_whatsapp_instances")
        .update({ last_qr_at: qr ? new Date().toISOString() : null, connection_state: "connecting" })
        .eq("user_id", user.id);

      // Registrar webhook do CRM (idempotente)
      try {
        const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook`;
        await fetch(`${baseUrl}/webhook/set/${encodeURIComponent(name)}`, {
          method: "POST", headers,
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: false,
              webhookBase64: false,
              events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
            },
          }),
        });
      } catch (e) { console.error("webhook register failed", e); }

      return json({ ok: true, instance_name: name, already_exists: exists, qr });
    }

    if (action === "connect") {
      if (!inst) return json({ ok: false, error: "Crie a instância primeiro" }, 400);
      const r = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(inst.instance_name)}`, { headers });
      const t = await r.text();
      let p: any = null; try { p = JSON.parse(t); } catch {}
      if (!r.ok) return json({ ok: false, status: r.status, error: p?.message || t.slice(0, 400) });
      const qr = p?.base64 || p?.qrcode?.base64 || p?.qrcode || null;
      await admin.from("user_whatsapp_instances").update({ last_qr_at: new Date().toISOString(), connection_state: "connecting" }).eq("id", inst.id);
      return json({ ok: true, qr });
    }

    if (action === "send") {
      if (!inst) return json({ ok: false, error: "WhatsApp não conectado" }, 400);
      // Cota
      if (addon.monthly_quota != null && (addon.monthly_used || 0) >= addon.monthly_quota) {
        return json({ ok: false, error: "Cota mensal de disparos atingida" }, 429);
      }
      const phone = String(body.phone || "").replace(/\D/g, "");
      const message = String(body.message || "").trim();
      if (phone.length < 10) return json({ ok: false, error: "Número inválido" }, 400);
      if (!message) return json({ ok: false, error: "Mensagem vazia" }, 400);

      // Garante DDI Brasil (55) se número vier sem código de país
      const fullPhone = (phone.length === 10 || phone.length === 11) ? `55${phone}` : phone;

      const r = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(inst.instance_name)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ number: fullPhone, text: message }),
      });
      const t = await r.text();
      let p: any = null; try { p = JSON.parse(t); } catch {}
      const okSend = r.ok;
      if (!okSend) console.error("sendText failed", r.status, t.slice(0, 400));

      await admin.from("message_history").insert({
        user_id: user.id,
        instance_name: inst.instance_name,
        phone: fullPhone,
        lead_id: body.lead_id || null,
        template_id: body.template_id || null,
        rendered_message: message,
        status: okSend ? "sent" : "failed",
        error: okSend ? null : (p?.message || t.slice(0, 400)),
        evolution_response: p,
      });

      if (okSend) {
        await admin
          .from("user_addons")
          .update({ monthly_used: (addon.monthly_used || 0) + 1 })
          .eq("id", addon.id);
      }

      return json({ ok: okSend, status: r.status, error: okSend ? null : (p?.message || t.slice(0, 400)) });
    }

    return json({ ok: false, error: "Ação desconhecida" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}