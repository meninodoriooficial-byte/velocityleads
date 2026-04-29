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
        const cddData = await fetchCasaDosDados(
          {
            name: result.business_name,
            atividade: result.business_type,
            address: result.address,
          },
          cddKey
        );
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
        const customPrompt = await getSystemSetting(supabase, "ai_enrichment_prompt");
        const aiData = await fetchAIEnrichment(result, lovableKey, customPrompt);
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
      .update(buildResultUpdate(result, enrichment, sourceUsed))
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

async function getSystemSetting(supabase: any, key: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", key)
      .maybeSingle();
    if (error) {
      console.log("getSystemSetting err", key, error);
      return null;
    }
    const v = data?.setting_value;
    if (typeof v === "string") return v;
    if (v == null) return null;
    return String(v);
  } catch (e) {
    console.log("getSystemSetting throw", e);
    return null;
  }
}

/** Constrói o update final para a search_results, propagando dados úteis (telefone, sócio, redes) para colunas de topo quando ausentes. */
function buildResultUpdate(
  result: any,
  enrichment: Record<string, any>,
  sourceUsed: string
) {
  const cdd = enrichment.casadosdados as any;
  const ai = enrichment.ai as any;
  const update: Record<string, any> = {
    enriched_data: enrichment,
    enriched_at: new Date().toISOString(),
    enriched_source: sourceUsed,
  };
  if (cdd) {
    if (!result.phone && cdd.telefone) update.phone = cdd.telefone;
    if (!result.email && cdd.email) update.email = cdd.email;
    if (!result.owner_name && cdd.proprietario) update.owner_name = cdd.proprietario;
    const social = { ...(result.social_media || {}) };
    let socialChanged = false;
    if (!social.instagram && cdd.instagram) {
      social.instagram = cdd.instagram;
      socialChanged = true;
    }
    if (!social.facebook && cdd.facebook) {
      social.facebook = cdd.facebook;
      socialChanged = true;
    }
    if (socialChanged) update.social_media = social;
  }
  if (ai) {
    if (!update.email && !result.email && Array.isArray(ai.emails) && ai.emails[0]) {
      update.email = ai.emails[0];
    }
    if (!update.phone && !result.phone && Array.isArray(ai.telefones) && ai.telefones[0]) {
      update.phone = ai.telefones[0];
    }
    if (!result.website && ai.site) update.website = ai.site;
    const social = { ...(update.social_media || result.social_media || {}) };
    let changed = false;
    const socials = ai.redes_sociais || {};
    for (const k of ["instagram", "facebook", "linkedin", "youtube", "tiktok"]) {
      if (!social[k] && socials[k]) {
        social[k] = socials[k];
        changed = true;
      }
    }
    if (changed) update.social_media = social;
  }
  return update;
}

/**
 * Casa dos Dados — busca por razão social + atividade (CNAE) e enriquece
 * com detalhes do CNPJ (sócios, telefone direto, e-mail, redes sociais).
 */
async function fetchCasaDosDados(
  input: { name: string; atividade?: string | null; address?: string | null },
  apiKey: string
) {
  const name = (input.name || "").trim();
  if (!name) return null;

  // 1) Buscar candidatos por razão social, filtrando por atividade quando possível
  const cnaeCode = extractCnaeCode(input.atividade);
  const uf = extractUF(input.address);

  const searchBody: Record<string, any> = {
    query: {
      razao_social: name,
      ...(cnaeCode ? { atividade_principal: [cnaeCode] } : {}),
      ...(uf ? { uf: [uf] } : {}),
    },
    page: 1,
  };

  const searchResp = await fetch(
    "https://api.casadosdados.com.br/v2/public/cnpj/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(searchBody),
    }
  );

  if (!searchResp.ok) {
    console.log("CDD search HTTP", searchResp.status, await safeText(searchResp));
    return null;
  }

  const searchData = await searchResp.json();
  const candidates: any[] =
    searchData?.data || searchData?.cnpjs || searchData?.results || [];
  if (!candidates.length) {
    console.log("CDD: sem candidatos para", name);
    return null;
  }

  // 2) Pegar o melhor candidato (primeiro retornado) e detalhar via /cnpj/:cnpj
  const first = candidates[0];
  const cnpjRaw: string | null =
    first.cnpj || first.numeroDeInscricao || first.numero_inscricao || null;
  const cnpjDigits = cnpjRaw ? cnpjRaw.replace(/\D/g, "") : null;

  let detail: any = first;
  if (cnpjDigits) {
    try {
      const dResp = await fetch(
        `https://api.casadosdados.com.br/v2/public/cnpj/${cnpjDigits}`,
        { headers: { "api-key": apiKey } }
      );
      if (dResp.ok) {
        const dJson = await dResp.json();
        detail = dJson?.data || dJson || first;
      } else {
        console.log("CDD detail HTTP", dResp.status);
      }
    } catch (e) {
      console.log("CDD detail throw", e);
    }
  }

  const socios: any[] = detail.socios || detail.qsa || first.socios || [];
  const proprietario =
    socios?.[0]?.nome_socio ||
    socios?.[0]?.nome ||
    socios?.[0]?.razao_social ||
    null;

  const telefone =
    detail.telefone ||
    detail.ddd_telefone_1 ||
    (detail.ddd_1 && detail.telefone_1
      ? `(${detail.ddd_1}) ${detail.telefone_1}`
      : null) ||
    detail.contato_telefonico ||
    null;

  const email = detail.email || detail.contato_email || null;

  // Redes sociais raramente vêm direto da Receita; tentar campos comuns
  const instagram =
    detail.instagram || detail.redes_sociais?.instagram || null;
  const facebook =
    detail.facebook || detail.redes_sociais?.facebook || null;

  return {
    cnpj: cnpjRaw,
    razao_social:
      detail.razao_social || detail.razaoSocial || first.razao_social || null,
    nome_fantasia:
      detail.nome_fantasia || detail.nomeFantasia || first.nome_fantasia || null,
    atividade_principal:
      detail.atividade_principal ||
      detail.cnae_fiscal_descricao ||
      first.atividade_principal ||
      null,
    porte: detail.porte || first.porte || null,
    capital_social: detail.capital_social || first.capital_social || null,
    data_abertura:
      detail.data_abertura ||
      detail.dataAbertura ||
      first.data_abertura ||
      null,
    socios,
    proprietario,
    telefone,
    email,
    instagram,
    facebook,
    raw: detail,
  };
}

function extractCnaeCode(atividade?: string | null): string | null {
  if (!atividade) return null;
  // Aceita formatos "47.21-1-02", "4721102", etc. — devolve apenas dígitos.
  const digits = String(atividade).replace(/\D/g, "");
  return digits.length >= 5 ? digits : null;
}

function extractUF(address?: string | null): string | null {
  if (!address) return null;
  const m = address.match(/\b([A-Z]{2})\b(?!.*\b[A-Z]{2}\b)/);
  return m ? m[1] : null;
}

async function safeText(resp: Response) {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

async function fetchAIEnrichment(result: any, apiKey: string, customSystemPrompt?: string | null) {
  const systemPrompt =
    (customSystemPrompt && customSystemPrompt.trim().length > 0)
      ? customSystemPrompt
      : "Você é um analista de dados B2B brasileiro. Retorne apenas dados plausíveis baseados em informações públicas conhecidas. Se não souber, deixe null.";

  const prompt = `Dados da empresa para pesquisar:

Nome: ${result.business_name}
Tipo: ${result.business_type || "—"}
Endereço: ${result.address || "—"}
Site conhecido: ${result.website || "—"}
Telefone conhecido: ${result.phone || "—"}

Faça a varredura conforme suas instruções e devolva os dados estruturados via a função save_enrichment.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_enrichment",
            description: "Salva dados enriquecidos sobre a empresa coletados em fontes públicas",
            parameters: {
              type: "object",
              properties: {
                cnpj: { type: ["string", "null"], description: "CNPJ formatado, se identificado com alta confiança" },
                razao_social: { type: ["string", "null"] },
                nome_fantasia: { type: ["string", "null"] },
                site: { type: ["string", "null"], description: "URL do site oficial" },
                emails: { type: "array", items: { type: "string" }, description: "E-mails de contato encontrados" },
                telefones: { type: "array", items: { type: "string" }, description: "Telefones adicionais (fixo/WhatsApp)" },
                redes_sociais: {
                  type: "object",
                  properties: {
                    instagram: { type: ["string", "null"] },
                    facebook: { type: ["string", "null"] },
                    linkedin: { type: ["string", "null"] },
                    youtube: { type: ["string", "null"] },
                    tiktok: { type: ["string", "null"] },
                  },
                  additionalProperties: false,
                },
                socios: { type: "array", items: { type: "string" }, description: "Nomes de sócios/responsáveis públicos" },
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