import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    // Cliente para validar JWT via getClaims (usa anon key)
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Cliente service role para operações administrativas
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { resultId } = await req.json();
    if (!resultId) {
      return new Response(JSON.stringify({ error: "resultId obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar resultado e validar dono
    const { data: result, error: rErr } = await supabase
      .from("search_results")
      .select("*, searches!inner(user_id)")
      .eq("id", resultId)
      .single();

    if (rErr || !result) {
      return new Response(JSON.stringify({ error: "Resultado não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if ((result as any).searches.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const enrichment: Record<string, unknown> = {};
    let sourceUsed = "";

    // 1) Tentar Casa dos Dados
    const cddKey = await getDecryptedKey(supabase, "CASADOSDADOS_API_KEY");
    if (cddKey) {
      try {
        const cddData = await fetchCasaDosDados(result.business_name, cddKey);
        if (cddData) {
          enrichment.casadosdados = cddData;
          sourceUsed = "casadosdados";
        }
      } catch (e) {
        console.error("Casa dos Dados error:", e);
      }
    }

    // 2) Complementar/Fallback com Lovable AI
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (lovableKey) {
      try {
        const aiData = await fetchAIEnrichment(result, lovableKey);
        if (aiData) {
          enrichment.ai = aiData;
          sourceUsed = sourceUsed ? `${sourceUsed}+ai` : "ai";
        }
      } catch (e) {
        console.error("AI enrichment error:", e);
      }
    }

    if (!sourceUsed) {
      return new Response(
        JSON.stringify({
          error:
            "Nenhuma fonte de enriquecimento disponível. Configure CASADOSDADOS_API_KEY ou LOVABLE_API_KEY.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: upErr } = await supabase
      .from("search_results")
      .update({
        enriched_data: enrichment,
        enriched_at: new Date().toISOString(),
        enriched_source: sourceUsed,
      })
      .eq("id", resultId);

    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({ success: true, source: sourceUsed, enriched_data: enrichment }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("enrich-lead error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getDecryptedKey(supabase: any, keyName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("get_api_key_decrypted", { _key_name: keyName });
    if (error) {
      console.log("getDecryptedKey err", keyName, error);
      return null;
    }
    return data || null;
  } catch (e) {
    console.log("getDecryptedKey throw", e);
    return null;
  }
}

async function fetchCasaDosDados(name: string, apiKey: string) {
  if (!name) return null;
  // Casa dos Dados — endpoint público de pesquisa por razão social
  const url = `https://api.casadosdados.com.br/v2/public/cnpj/search`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({ query: { razaoSocial: name }, page: 1 }),
  });
  if (!resp.ok) {
    console.log("CDD HTTP", resp.status);
    return null;
  }
  const data = await resp.json();
  const first = data?.data?.[0] || data?.cnpjs?.[0] || null;
  if (!first) return null;
  return {
    cnpj: first.cnpj || first.numeroDeInscricao || null,
    razao_social: first.razao_social || first.razaoSocial || null,
    nome_fantasia: first.nome_fantasia || first.nomeFantasia || null,
    atividade_principal: first.atividade_principal || first.cnaePrincipal || null,
    porte: first.porte || null,
    capital_social: first.capital_social || null,
    data_abertura: first.data_abertura || first.dataAbertura || null,
    socios: first.socios || first.qsa || [],
    raw: first,
  };
}

async function fetchAIEnrichment(result: any, apiKey: string) {
  const prompt = `Pesquise informações públicas adicionais sobre a empresa abaixo e retorne dados estruturados úteis para prospecção B2B.

Nome: ${result.business_name}
Tipo: ${result.business_type || "—"}
Endereço: ${result.address || "—"}
Site: ${result.website || "—"}
Telefone: ${result.phone || "—"}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "Você é um analista de dados B2B brasileiro. Retorne apenas dados plausíveis baseados em informações públicas conhecidas. Se não souber, deixe null." },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_enrichment",
            description: "Salva dados enriquecidos sobre a empresa",
            parameters: {
              type: "object",
              properties: {
                descricao: { type: "string", description: "Breve descrição (1-2 frases) da empresa" },
                segmento: { type: "string" },
                porte_estimado: { type: "string", enum: ["MEI", "Pequeno", "Médio", "Grande", "Desconhecido"] },
                publico_alvo: { type: "string" },
                produtos_servicos: { type: "array", items: { type: "string" } },
                diferenciais: { type: "array", items: { type: "string" } },
                pitch_abordagem: { type: "string", description: "Sugestão curta de pitch comercial personalizado" },
              },
              required: ["descricao", "segmento"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_enrichment" } },
    }),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Rate limit do Lovable AI excedido. Tente novamente em instantes.");
    if (resp.status === 402) throw new Error("Créditos esgotados no workspace Lovable AI.");
    const t = await resp.text();
    console.log("AI gateway error", resp.status, t);
    return null;
  }
  const data = await resp.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) return null;
  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    return null;
  }
}