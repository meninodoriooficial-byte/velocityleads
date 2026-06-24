import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims?.sub) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", claims.claims.sub)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ ok: false, error: "Apenas admins" }, 403);

    const { data: cfgRow } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "evolution_api")
      .maybeSingle();
    const cfg: any = cfgRow?.setting_value;
    if (!cfg?.api_url || !cfg?.api_key) {
      return json({ ok: false, error: "Evolution API não configurada" }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "ping";
    const baseUrl = String(cfg.api_url).replace(/\/+$/, "");
    const headers = { apikey: cfg.api_key, "Content-Type": "application/json" };

    if (action === "ping") {
      const t0 = Date.now();
      const r = await fetch(`${baseUrl}/instance/fetchInstances`, { headers });
      const elapsed = Date.now() - t0;
      const text = await r.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* noop */ }
      if (!r.ok) {
        return json({ ok: false, status: r.status, elapsed_ms: elapsed, error: parsed?.message || text.slice(0, 300) });
      }
      const count = Array.isArray(parsed) ? parsed.length : 0;
      return json({ ok: true, status: r.status, elapsed_ms: elapsed, instances_count: count, message: "Conexão OK" });
    }

    if (action === "create") {
      const instance = String(body.instance || "").trim();
      if (!instance) return json({ ok: false, error: "Informe o nome da instância" }, 400);
      const r = await fetch(`${baseUrl}/instance/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          instanceName: instance,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      });
      const text = await r.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* noop */ }
      // 403/409 quando já existe — tratamos como sucesso idempotente
      const alreadyExists = (r.status === 403 || r.status === 409) ||
        /already in use|already exists/i.test(text);
      if (!r.ok && !alreadyExists) {
        return json({ ok: false, status: r.status, error: parsed?.message || parsed?.response?.message || text.slice(0, 400) });
      }
      return json({
        ok: true,
        status: r.status,
        already_exists: alreadyExists,
        message: alreadyExists ? "Instância já existia" : "Instância criada",
        qr: parsed?.qrcode?.base64 || parsed?.qrcode || null,
        response: parsed,
      });
    }

    if (action === "connect") {
      const instance = String(body.instance || "").trim();
      if (!instance) return json({ ok: false, error: "Informe o nome da instância" }, 400);
      const r = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instance)}`, { headers });
      const text = await r.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* noop */ }
      if (!r.ok) {
        return json({ ok: false, status: r.status, error: parsed?.message || parsed?.response?.message || text.slice(0, 400) });
      }
      const qr = parsed?.base64 || parsed?.qrcode?.base64 || parsed?.qrcode || null;
      return json({ ok: true, status: r.status, qr, pairingCode: parsed?.pairingCode || null, response: parsed });
    }

    if (action === "state") {
      const instance = String(body.instance || "").trim();
      if (!instance) return json({ ok: false, error: "Informe o nome da instância" }, 400);
      const r = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, { headers });
      const text = await r.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* noop */ }
      if (!r.ok) {
        return json({ ok: false, status: r.status, error: parsed?.message || parsed?.response?.message || text.slice(0, 400) });
      }
      const state = parsed?.instance?.state || parsed?.state || parsed?.instance?.status || null;
      return json({ ok: true, status: r.status, state, connected: state === "open", response: parsed });
    }

    if (action === "send") {
      const instance = String(body.instance || "").trim();
      const number = String(body.number || "").replace(/\D/g, "");
      const message = String(body.message || "").trim();
      if (!instance) return json({ ok: false, error: "Informe o nome da instância" }, 400);
      if (number.length < 10) return json({ ok: false, error: "Número inválido (use DDI+DDD+número)" }, 400);
      if (!message) return json({ ok: false, error: "Mensagem vazia" }, 400);

      const r = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ number, text: message }),
      });
      const text = await r.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* noop */ }
      if (!r.ok) {
        const errMsg = parsed?.message || parsed?.response?.message || text.slice(0, 400);
        const notFound = r.status === 404 || /does not exist|not found/i.test(String(errMsg));
        return json({
          ok: false,
          status: r.status,
          error: notFound
            ? `Instância "${instance}" não existe ou não está conectada. Clique em "Criar instância" e escaneie o QR Code primeiro.`
            : errMsg,
        });
      }
      return json({ ok: true, status: r.status, message: "Mensagem enviada", response: parsed });
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