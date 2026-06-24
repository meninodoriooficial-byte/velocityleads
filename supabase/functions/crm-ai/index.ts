// IA do CRM: sugerir resposta para um lead OU resumir a conversa.
// Usa Lovable AI Gateway (LOVABLE_API_KEY) com modelo gratuito google/gemini-2.5-flash.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return j({ ok: false, error: "Unauthorized" }, 401);

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    const user = u?.user;
    if (!user) return j({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Add-on ativo
    const { data: addon } = await admin.from("user_addons").select("id").eq("user_id", user.id)
      .eq("addon_slug", "whatsapp_crm").eq("status", "active").maybeSingle();
    if (!addon) return j({ ok: false, error: "Add-on WhatsApp CRM não ativo" }, 403);

    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || "suggest"); // suggest | summary
    const conversationId = String(body.conversationId || "");
    if (!conversationId) return j({ ok: false, error: "conversationId obrigatório" }, 400);

    const { data: conv } = await admin.from("crm_conversations").select("*").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
    if (!conv) return j({ ok: false, error: "Conversa não encontrada" }, 404);

    const { data: msgs } = await admin.from("crm_messages").select("direction,type,body,created_at")
      .eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(40);

    const transcript = (msgs || []).map((m: any) => {
      const who = m.direction === "in" ? "Lead" : m.direction === "note" ? "Nota interna" : "Vendedor";
      return `[${who}] ${m.body || `(${m.type})`}`;
    }).join("\n");

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return j({ ok: false, error: "LOVABLE_API_KEY ausente" }, 500);

    const sysSuggest = `Você é um vendedor consultivo brasileiro respondendo via WhatsApp para "${conv.contact_name || conv.phone}".
Regras: 1-3 frases, tom cordial, evite jargões, chame pelo primeiro nome quando souber, faça uma pergunta de avanço quando útil.
Responda APENAS o texto da mensagem, sem aspas, sem assinatura, sem prefixos.`;

    const sysSummary = `Resuma a conversa abaixo em bullets curtos em português:
- Quem é o lead e qual a necessidade
- O que já foi oferecido/discutido
- Objeções/dúvidas pendentes
- Próximo passo recomendado
Use no máximo 6 bullets.`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: mode === "summary" ? sysSummary : sysSuggest },
          { role: "user", content: transcript || "(sem mensagens ainda)" },
        ],
      }),
    });
    if (r.status === 429) return j({ ok: false, error: "Limite de IA atingido. Tente em instantes." }, 429);
    if (r.status === 402) return j({ ok: false, error: "Créditos de IA esgotados." }, 402);
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return j({ ok: true, text });
  } catch (e: any) {
    return j({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function j(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}