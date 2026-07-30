import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string, onTimeout?: () => void): Promise<T> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} em ${Math.round(ms / 1000)}s`));
          queueMicrotask(() => {
            try { onTimeout?.(); } catch { /* noop */ }
          });
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const b64 = (value: string) => {
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const cleanAddress = (value: string) => value.trim().replace(/[\r\n<>]/g, "");

class SmtpSession {
  private conn: Deno.Conn;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = "";

  constructor(conn: Deno.Conn) {
    this.conn = conn;
    this.reader = conn.readable.getReader();
    this.writer = conn.writable.getWriter();
  }

  async upgradeToTls(hostname: string) {
    this.reader.releaseLock();
    this.writer.releaseLock();
    this.conn = await withTimeout(Deno.startTls(this.conn, { hostname }), 8_000, "Timeout ao iniciar STARTTLS", () => this.close());
    this.reader = this.conn.readable.getReader();
    this.writer = this.conn.writable.getWriter();
    this.buffer = "";
  }

  close() {
    try { this.conn.close(); } catch { /* noop */ }
  }

  async write(raw: string) {
    await withTimeout(this.writer.write(encoder.encode(raw)), 6_000, "Timeout ao enviar comando SMTP", () => this.close());
  }

  async readResponse(label: string, timeoutMs = 8_000) {
    const lines: string[] = [];
    while (true) {
      let idx = this.buffer.indexOf("\n");
      while (idx < 0) {
        const result = await withTimeout(this.reader.read(), timeoutMs, `Timeout aguardando resposta SMTP (${label})`, () => this.close());
        if (result.done) throw new Error(`Servidor encerrou a conexão durante ${label}`);
        this.buffer += decoder.decode(result.value, { stream: true });
        idx = this.buffer.indexOf("\n");
      }

      const line = this.buffer.slice(0, idx + 1).replace(/\r?\n$/, "");
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      lines.push(line);

      if (/^\d{3} /.test(line)) {
        return { code: Number(line.slice(0, 3)), text: lines.join("\n") };
      }
    }
  }

  async command(raw: string, expected: number[], label: string, timeoutMs = 8_000) {
    await this.write(`${raw}\r\n`);
    const response = await this.readResponse(label, timeoutMs);
    if (!expected.includes(response.code)) {
      throw new Error(`${label}: ${response.text}`);
    }
    return response;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let session: SmtpSession | null = null;

  try {
    const { host, port, secure, user, pass, from, to, sendTest, subject, body } = await req.json();
    if (!host || !user || !pass) {
      return json({ ok: false, error: "Informe host, usuário e senha." });
    }

    const p = Number(port) || 465;
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      return json({ ok: false, error: "Porta SMTP inválida." });
    }

    const hostname = String(host).trim();
    const username = String(user).trim();
    const password = String(pass).trim().replace(/\s+/g, "");
    const sender = cleanAddress(String(from || user));
    const target = cleanAddress(String(to || from || user));
    const useImplicitTls = secure ?? p === 465;
    const useStartTls = !useImplicitTls && p !== 25;

    const conn = useImplicitTls
      ? await withTimeout(Deno.connectTls({ hostname, port: p }), 10_000, "Timeout ao conectar com SSL/TLS")
      : await withTimeout(Deno.connect({ hostname, port: p }), 10_000, "Timeout ao conectar ao SMTP");

    session = new SmtpSession(conn);

    const greeting = await session.readResponse("boas-vindas");
    if (greeting.code !== 220) throw new Error(`Conexão recusada: ${greeting.text}`);

    await session.command("EHLO velocityleads.local", [250], "EHLO");

    if (useStartTls) {
      await session.command("STARTTLS", [220], "STARTTLS");
      await session.upgradeToTls(hostname);
      await session.command("EHLO velocityleads.local", [250], "EHLO após STARTTLS");
    }

    await session.command("AUTH LOGIN", [334], "Autenticação");
    await session.command(b64(username), [334], "Usuário SMTP");
    await session.command(b64(password), [235], "Senha SMTP", 50_000);

    if (sendTest) {
      const subj = String(subject || "Teste de envio SMTP").replace(/[\r\n]/g, " ");
      const text = String(body || "Este é um e-mail de teste enviado pelo seu SaaS de leads. Se você está lendo isso, sua configuração SMTP está funcionando! ✅");
      await session.command(`MAIL FROM:<${sender}>`, [250], "MAIL FROM");
      await session.command(`RCPT TO:<${target}>`, [250, 251], "RCPT TO");
      await session.command("DATA", [354], "DATA");
      const headers =
        `From: ${sender}\r\n` +
        `To: ${target}\r\n` +
        `Subject: ${subj}\r\n` +
        `MIME-Version: 1.0\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n` +
        `Date: ${new Date().toUTCString()}\r\n` +
        `\r\n`;
      const bodyEscaped = text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
      await session.command(`${headers}${bodyEscaped}\r\n.`, [250], "Envio de mensagem", 30_000);
    }

    try { await session.command("QUIT", [221], "Encerrar conexão"); } catch { /* noop */ }
    session.close();
    session = null;

    return json({ ok: true, sent_to: target, authenticated: true, sent: !!sendTest });
  } catch (e) {
    session?.close();
    const msg = (e as Error).message || String(e);
    let hint = "";
    if (/5\.7\.139|SmtpClientAuthentication is disabled/i.test(msg)) {
      hint = " — A Microsoft DESATIVOU o SMTP básico nesta caixa de correio. Soluções: (1) se for Microsoft 365/corporativo, peça ao admin para habilitar 'Authenticated SMTP' em admin.microsoft.com → Usuários → Email apps; (2) se a conta tem alias @gmail.com vinculado, use o preset GMAIL com smtp.gmail.com:465 e uma Senha de App do Google; (3) crie uma conta @outlook.com nova ou use outro provedor. Detalhes: https://aka.ms/smtp_auth_disabled";
    } else if (/auth|535|5\.7\.3|5\.7\.8|credential|password|senha/i.test(msg)) {
      hint = " — A Microsoft/Google rejeitou a autenticação. É OBRIGATÓRIO usar uma Senha de App (não a senha da conta): Outlook/Hotmail pessoal → ative verificação em 2 etapas em account.live.com/proofs/Manage e gere a senha em account.live.com/proofs/AppPassword; Gmail → myaccount.google.com/apppasswords. Cole a senha de 16 caracteres sem espaços.";
    } else if (/timeout|ECONN|ENOTFOUND|getaddrinfo|conectar/i.test(msg)) {
      hint = " — verifique host/porta. Para Outlook pessoal use smtp-mail.outlook.com na porta 587 com SSL desativado; para Microsoft 365 use smtp.office365.com.";
    } else if (/tls|ssl|starttls|certificate/i.test(msg)) {
      hint = " — confira o modo de segurança: 465 com SSL ativado ou 587 com SSL desativado.";
    }
    return json({ ok: false, error: msg + hint });
  }
});