import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { SMTPClient } from "npm:emailjs@4.0.3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { host, port, secure, user, pass, from, to } = await req.json();
    if (!host || !user || !pass) {
      return new Response(JSON.stringify({ ok: false, error: "Informe host, usuário e senha." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const client = new SMTPClient({
      user,
      password: pass,
      host,
      port: Number(port) || 465,
      ssl: secure ?? true,
      tls: !(secure ?? true),
      timeout: 15000,
    });
    const target = to || from || user;
    await client.sendAsync({
      from: from || user,
      to: target,
      subject: "Teste de conexão SMTP — Lovable",
      text: "Se você recebeu este e-mail, a configuração SMTP está funcionando corretamente.",
    } as any);
    return new Response(JSON.stringify({ ok: true, sent_to: target }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    let hint = "";
    if (/auth|535|credential|password/i.test(msg)) hint = " — verifique usuário/senha. No Gmail use uma Senha de App (não a senha normal).";
    else if (/timeout|ECONN|ENOTFOUND|getaddrinfo/i.test(msg)) hint = " — verifique host/porta e se sua rede permite a conexão.";
    else if (/tls|ssl/i.test(msg)) hint = " — alterne SSL/TLS (465 com SSL ou 587 sem SSL).";
    return new Response(JSON.stringify({ ok: false, error: msg + hint }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});