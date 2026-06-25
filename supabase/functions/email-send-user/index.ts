import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { SMTPClient } from "npm:emailjs@4.0.3";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function refreshGoogle(account: any, admin: any) {
  if (account.oauth_expires_at && new Date(account.oauth_expires_at).getTime() > Date.now() + 60_000) return account.oauth_access_token;
  const { data: setting } = await admin.from("system_settings").select("setting_value").eq("setting_key", "email_oauth").maybeSingle();
  const cfg: any = setting?.setting_value || {};
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.google_client_id, client_secret: cfg.google_client_secret, refresh_token: account.oauth_refresh_token, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Falha ao renovar token Google: " + (j.error_description || j.error));
  await admin.from("email_accounts").update({ oauth_access_token: j.access_token, oauth_expires_at: new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString() }).eq("id", account.id);
  return j.access_token;
}

async function refreshMicrosoft(account: any, admin: any) {
  if (account.oauth_expires_at && new Date(account.oauth_expires_at).getTime() > Date.now() + 60_000) return account.oauth_access_token;
  const { data: setting } = await admin.from("system_settings").select("setting_value").eq("setting_key", "email_oauth").maybeSingle();
  const cfg: any = setting?.setting_value || {};
  const tenant = cfg.microsoft_tenant || "common";
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.microsoft_client_id, client_secret: cfg.microsoft_client_secret, refresh_token: account.oauth_refresh_token, grant_type: "refresh_token", scope: "offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read" }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Falha ao renovar token Microsoft: " + (j.error_description || j.error));
  await admin.from("email_accounts").update({ oauth_access_token: j.access_token, oauth_expires_at: new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString() }).eq("id", account.id);
  return j.access_token;
}

function buildRaw(from: string, fromName: string | null, to: string, subject: string, html: string, text: string) {
  const boundary = "b_" + crypto.randomUUID();
  const fromHeader = fromName ? `${fromName} <${from}>` : from;
  const msg = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(text || html.replace(/<[^>]+>/g, "")))),
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(html || `<pre>${text}</pre>`))),
    `--${boundary}--`,
  ].join("\r\n");
  return btoa(unescape(encodeURIComponent(msg))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const admin = createClient(PROJECT_URL, SERVICE_KEY);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: "Usuário inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = userData.user.id;

    const body = await req.json();
    const { to, subject, html, text, lead_id, template_id, account_id } = body || {};
    if (!to || !subject || (!html && !text)) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: to, subject, html|text" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // pick account
    let account: any = null;
    if (account_id) {
      const { data } = await admin.from("email_accounts").select("*").eq("user_id", userId).eq("id", account_id).maybeSingle();
      account = data;
    } else {
      const { data } = await admin.from("email_accounts").select("*").eq("user_id", userId).eq("is_active", true).order("send_order").limit(1).maybeSingle();
      account = data;
    }
    if (!account) return new Response(JSON.stringify({ error: "Nenhuma conta de e-mail conectada. Conecte em Email Marketing." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let sendError: string | null = null;
    try {
      if (account.provider === "gmail") {
        const token = await refreshGoogle(account, admin);
        const raw = buildRaw(account.email, account.display_name, to, subject, html || "", text || "");
        const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        });
        if (!r.ok) {
          const raw = await r.text();
          if (/Mail service not enabled|failedPrecondition/i.test(raw)) {
            sendError = "Gmail API não está ativada no projeto Google Cloud das credenciais OAuth. Acesse https://console.cloud.google.com/apis/library/gmail.googleapis.com, selecione o projeto correto e clique em Ativar.";
          } else {
            sendError = raw.slice(0, 500);
          }
        }
      } else if (account.provider === "outlook") {
        const token = await refreshMicrosoft(account, admin);
        const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: html ? "HTML" : "Text", content: html || text },
              toRecipients: [{ emailAddress: { address: to } }],
              from: { emailAddress: { address: account.email, name: account.display_name || undefined } },
            }, saveToSentItems: true,
          }),
        });
        if (!r.ok) sendError = (await r.text()).slice(0, 500);
      } else {
        // smtp
        if (!account.smtp_host || !account.smtp_pass) throw new Error("Conta SMTP sem host/senha");
        const client = new SMTPClient({
          user: account.smtp_user || account.email,
          password: account.smtp_pass,
          host: account.smtp_host,
          port: account.smtp_port || 465,
          ssl: account.smtp_secure ?? true,
        });
        await client.sendAsync({
          from: account.display_name ? `${account.display_name} <${account.email}>` : account.email,
          to,
          subject,
          text: text || (html ? html.replace(/<[^>]+>/g, "") : ""),
          attachment: html ? [{ data: html, alternative: true }] : undefined,
        } as any);
      }
    } catch (e) {
      sendError = (e as Error).message;
    }

    const status = sendError ? "failed" : "sent";
    await admin.from("email_history").insert({
      user_id: userId, lead_id: lead_id || null, account_id: account.id,
      template_id: template_id || null, to_email: to, subject,
      body_html: html || null, body_text: text || null,
      provider: account.provider, status, error: sendError ? { message: sendError } : null,
    });

    if (sendError) return new Response(JSON.stringify({ ok: false, error: sendError }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // increment sent_today (reset daily)
    const today = new Date().toISOString().slice(0, 10);
    const reset = account.last_reset !== today;
    await admin.from("email_accounts").update({
      sent_today: reset ? 1 : (account.sent_today || 0) + 1,
      last_reset: today,
    }).eq("id", account.id);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});