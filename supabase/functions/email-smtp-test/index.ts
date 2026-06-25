import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, rej) =>
        setTimeout(() => rej(new Error(`timeout após ${ms / 1000}s — verifique host/porta/SSL e se a rede do servidor permite a conexão`)), ms)
      ),
    ]);
  try {
    const { host, port, secure, user, pass, from, to } = await req.json();
    if (!host || !user || !pass) {
      return new Response(JSON.stringify({ ok: false, error: "Informe host, usuário e senha." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const p = Number(port) || 465;
    const useTLS = secure ?? (p === 465);
    const client = new SMTPClient({
      connection: {
        hostname: host,
        port: p,
        tls: useTLS, // true => SMTPS direto (465); false => STARTTLS opcional (587)
        auth: { username: user, password: pass },
      },
      debug: { allowUnsecure: !useTLS },
    });
    const target = to || from || user;
    await withTimeout(
      client.send({
        from: from || user,
        to: target,
        subject: "Teste de conexão SMTP — Lovable",
        content: "Se você recebeu este e-mail, a configuração SMTP está funcionando corretamente.",
      }),
      20000
    );
    try { await client.close(); } catch { /* noop */ }
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