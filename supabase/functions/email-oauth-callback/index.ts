import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REDIRECT_BASE = `${PROJECT_URL}/functions/v1/email-oauth-callback`;

async function sign(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const html = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui;background:#0b0b0f;color:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#15151c;padding:32px;border-radius:12px;max-width:420px;text-align:center;border:1px solid #27272a}
h1{margin:0 0 8px;font-size:18px}p{color:#a1a1aa;font-size:14px;margin:8px 0}</style></head>
<body><div class="card">${body}<p style="margin-top:16px"><a style="color:#60a5fa" href="#" onclick="window.close();return false">Fechar janela</a></p></div>
<script>try{window.opener&&window.opener.postMessage({type:'email-oauth-done'},'*')}catch(e){};setTimeout(()=>window.close(),1500)</script></body></html>`;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") as "google" | "microsoft" | null;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (errParam) return new Response(html("Erro", `<h1>❌ Erro do provedor</h1><p>${errParam}</p>`), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (!provider || !code || !state) return new Response(html("Erro", "<h1>Parâmetros faltando</h1>"), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });

  // verify state
  const [payload, sig] = state.split(".");
  if (!payload || !sig || (await sign(payload)) !== sig) {
    return new Response(html("Erro", "<h1>State inválido</h1>"), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  const { u: userId, p: stateProvider } = JSON.parse(atob(payload));
  if (stateProvider !== provider) return new Response(html("Erro", "<h1>Provider mismatch</h1>"), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });

  const admin = createClient(PROJECT_URL, SERVICE_KEY);
  const { data: setting } = await admin.from("system_settings").select("setting_value").eq("setting_key", "email_oauth").maybeSingle();
  const cfg: any = setting?.setting_value || {};
  const redirect_uri = `${REDIRECT_BASE}?provider=${provider}`;

  try {
    let tokenRes: Response;
    if (provider === "google") {
      tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, client_id: cfg.google_client_id, client_secret: cfg.google_client_secret, redirect_uri, grant_type: "authorization_code",
        }),
      });
    } else {
      const tenant = cfg.microsoft_tenant || "common";
      tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, client_id: cfg.microsoft_client_id, client_secret: cfg.microsoft_client_secret, redirect_uri, grant_type: "authorization_code",
          scope: "offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read",
        }),
      });
    }
    const tok = await tokenRes.json();
    if (!tokenRes.ok) return new Response(html("Erro", `<h1>❌ Falha na troca do código</h1><p>${tok.error_description || tok.error || "erro"}</p>`), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });

    // fetch user email
    let email = "", display = "";
    if (provider === "google") {
      const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then(r => r.json());
      email = ui.email; display = ui.name || ui.email;
    } else {
      const ui = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then(r => r.json());
      email = ui.mail || ui.userPrincipalName; display = ui.displayName || email;
    }
    if (!email) return new Response(html("Erro", "<h1>Não foi possível obter o e-mail</h1>"), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });

    const expiresAt = new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString();

    // check existing
    const { data: existing } = await admin.from("email_accounts").select("id, send_order").eq("user_id", userId).eq("email", email).maybeSingle();
    if (existing) {
      await admin.from("email_accounts").update({
        provider: provider === "google" ? "gmail" : "outlook",
        display_name: display,
        oauth_access_token: tok.access_token,
        oauth_refresh_token: tok.refresh_token || null,
        oauth_expires_at: expiresAt,
        is_active: true,
      }).eq("id", existing.id);
    } else {
      const { data: maxRow } = await admin.from("email_accounts").select("send_order").eq("user_id", userId).order("send_order", { ascending: false }).limit(1).maybeSingle();
      const nextOrder = ((maxRow?.send_order as number) || 0) + 1;
      const { error: insErr } = await admin.from("email_accounts").insert({
        user_id: userId,
        provider: provider === "google" ? "gmail" : "outlook",
        email, display_name: display,
        oauth_access_token: tok.access_token,
        oauth_refresh_token: tok.refresh_token || null,
        oauth_expires_at: expiresAt,
        send_order: nextOrder, daily_limit: 50, is_active: true, smtp_secure: true,
      });
      if (insErr) return new Response(html("Erro", `<h1>❌ Erro ao salvar</h1><p>${insErr.message}</p>`), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    return new Response(html("OK", `<h1>✅ Conta conectada</h1><p>${email}</p><p>Você pode fechar esta janela.</p>`), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (e) {
    return new Response(html("Erro", `<h1>❌ Erro</h1><p>${(e as Error).message}</p>`), { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
});