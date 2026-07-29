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

    // 1b) Fallback: scraping público do casadosdados.com.br para descobrir CNPJ
    //     quando a API não retornou nada (ou não há chave configurada).
    if (!(enrichment.casadosdados as any)?.cnpj) {
      try {
        const scrapedCnpj = await scrapeCasaDosDadosPublic(
          result.business_name,
          result.address
        );
        if (scrapedCnpj) {
          enrichment.casadosdados = {
            ...(enrichment.casadosdados as any || {}),
            cnpj: scrapedCnpj,
            fonte: "scrape_publico",
          };
          sourceUsed = sourceUsed ? `${sourceUsed}+cdd_scrape` : "cdd_scrape";
        }
      } catch (e) {
        console.error("CDD scrape fallback error:", e);
      }
    }

    // 2) BrasilAPI (grátis) — usa o CNPJ obtido em (1) para puxar quadro societário,
    //     situação cadastral, CNAEs secundários, capital, e-mail/telefone oficial da Receita.
    const cnpjFromCdd = ((enrichment.casadosdados as any)?.cnpj || "")
      .toString()
      .replace(/\D/g, "");
    if (cnpjFromCdd && cnpjFromCdd.length === 14) {
      try {
        const brasil = await fetchBrasilApi(cnpjFromCdd);
        if (brasil) {
          enrichment.brasilapi = brasil;
          sourceUsed = sourceUsed ? `${sourceUsed}+brasilapi` : "brasilapi";
        }
      } catch (e) {
        console.error("BrasilAPI error:", e);
      }
    }

    // 3) Scraper aprimorado do site — visita páginas de contato e extrai e-mails / redes
    const siteUrl =
      result.website ||
      (enrichment.casadosdados as any)?.site ||
      null;
    if (siteUrl) {
      try {
        const scraped = await scrapeSiteDeep(siteUrl);
        if (scraped && (scraped.emails?.length || scraped.phones?.length || scraped.instagram || scraped.facebook || scraped.linkedin)) {
          enrichment.scraped = scraped;
          sourceUsed = sourceUsed ? `${sourceUsed}+scrape` : "scrape";
        }
      } catch (e) {
        console.error("scrape error:", e);
      }
    }

    // 4) Complementar/Fallback com Lovable AI
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    let aiError: string | null = null;
    if (lovableKey) {
      try {
        const customPrompt = await getSystemSetting(supabase, "ai_enrichment_prompt");
        const aiData = await fetchAIEnrichment(result, lovableKey, customPrompt);
        if (aiData) {
          enrichment.ai = aiData;
          sourceUsed = sourceUsed ? `${sourceUsed}+ai` : "ai";
        }
      } catch (e: any) {
        aiError = e?.message || String(e);
        console.error("AI enrichment error:", e);
      }
    } else {
      aiError = "LOVABLE_API_KEY não configurada";
    }

    if (!sourceUsed) {
      return new Response(
        JSON.stringify({
          success: false,
          source: "none",
          error:
            aiError
              ? `Não foi possível enriquecer este lead: ${aiError}`
              : "Nenhum dado adicional encontrado para este lead nas fontes públicas.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
  const brasil = enrichment.brasilapi as any;
  const scraped = enrichment.scraped as any;
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
  if (brasil) {
    if (!update.phone && !result.phone && brasil.telefone) update.phone = brasil.telefone;
    if (!update.email && !result.email && brasil.email) update.email = brasil.email;
    if (!update.owner_name && !result.owner_name && brasil.proprietario) {
      update.owner_name = brasil.proprietario;
    }
  }
  if (scraped) {
    if (!update.email && !result.email && scraped.emails?.[0]) {
      update.email = scraped.emails[0];
    }
    if (!update.phone && !result.phone && scraped.phones?.[0]) {
      update.phone = scraped.phones[0];
    }
    const social = { ...(update.social_media || result.social_media || {}) };
    let changed = false;
    for (const k of ["instagram", "facebook", "linkedin", "youtube", "tiktok"] as const) {
      if (!social[k] && (scraped as any)[k]) {
        social[k] = (scraped as any)[k];
        changed = true;
      }
    }
    if (changed) update.social_media = social;
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

/** BrasilAPI — consulta CNPJ (grátis, sem chave). */
async function fetchBrasilApi(cnpjDigits: string) {
  try {
    const resp = await fetch(
      `https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`,
      { headers: { Accept: "application/json" } }
    );
    if (!resp.ok) {
      console.log("BrasilAPI HTTP", resp.status);
      return null;
    }
    const d = await resp.json();
    const socios: any[] = d.qsa || [];
    const proprietario =
      socios?.[0]?.nome_socio || socios?.[0]?.nome || null;
    const telefone =
      d.ddd_telefone_1
        ? formatPhoneBR(d.ddd_telefone_1)
        : (d.ddd_1 && d.telefone_1 ? `(${d.ddd_1}) ${d.telefone_1}` : null);
    // Tenta complementar com cnpj.ws (público) para inscrição estadual
    // e fallback de Simples/MEI quando BrasilAPI não retornar.
    const extra = await fetchCnpjWs(cnpjDigits);
    return {
      cnpj: d.cnpj || cnpjDigits,
      razao_social: d.razao_social || null,
      nome_fantasia: d.nome_fantasia || null,
      situacao_cadastral: d.descricao_situacao_cadastral || null,
      data_abertura: d.data_inicio_atividade || null,
      capital_social: d.capital_social || null,
      porte: d.descricao_porte || null,
      natureza_juridica: d.natureza_juridica || null,
      atividade_principal: d.cnae_fiscal_descricao || null,
      cnae_principal_codigo: d.cnae_fiscal || null,
      cnae_principal_descricao: d.cnae_fiscal_descricao || null,
      atividades_secundarias: (d.cnaes_secundarios || []).map((c: any) => c.descricao).filter(Boolean),
      endereco_completo: [
        d.logradouro,
        d.numero,
        d.complemento,
        d.bairro,
        d.municipio,
        d.uf,
        d.cep,
      ].filter(Boolean).join(", "),
      email: d.email || null,
      telefone,
      socios,
      proprietario,
      opcao_pelo_simples:
        typeof d.opcao_pelo_simples === "boolean"
          ? d.opcao_pelo_simples
          : extra?.simples ?? null,
      data_opcao_pelo_simples: d.data_opcao_pelo_simples || extra?.data_simples || null,
      opcao_pelo_mei:
        typeof d.opcao_pelo_mei === "boolean"
          ? d.opcao_pelo_mei
          : extra?.mei ?? null,
      data_opcao_pelo_mei: d.data_opcao_pelo_mei || extra?.data_mei || null,
      inscricoes_estaduais: extra?.inscricoes_estaduais || [],
      inscricao_estadual: extra?.inscricao_estadual || null,
    };
  } catch (e) {
    console.log("fetchBrasilApi throw", e);
    return null;
  }
}

/**
 * cnpj.ws (público) — complementa com inscrição estadual e regime tributário.
 * Rate limit baixo (3/min), use apenas como complemento.
 */
async function fetchCnpjWs(cnpjDigits: string): Promise<{
  inscricoes_estaduais: Array<{ uf: string; inscricao: string; ativo: boolean }>;
  inscricao_estadual: string | null;
  simples: boolean | null;
  data_simples: string | null;
  mei: boolean | null;
  data_mei: string | null;
} | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(`https://publica.cnpj.ws/cnpj/${cnpjDigits}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    }).finally(() => clearTimeout(t));
    if (!resp.ok) {
      console.log("cnpj.ws HTTP", resp.status);
      return null;
    }
    const d = await resp.json();
    const est = d.estabelecimento || {};
    const ies: any[] = Array.isArray(est.inscricoes_estaduais)
      ? est.inscricoes_estaduais
      : [];
    const mapped = ies.map((i: any) => ({
      uf: i.estado?.sigla || i.uf || "",
      inscricao: i.inscricao_estadual || i.inscricao || "",
      ativo: !!i.ativo,
    })).filter((x: any) => x.inscricao);
    const ativa = mapped.find((x: any) => x.ativo) || mapped[0] || null;
    return {
      inscricoes_estaduais: mapped,
      inscricao_estadual: ativa ? `${ativa.inscricao}${ativa.uf ? ` (${ativa.uf})` : ""}` : null,
      simples: d.simples?.simples === "Sim" ? true : d.simples?.simples === "Não" ? false : null,
      data_simples: d.simples?.data_opcao_simples || null,
      mei: d.simples?.mei === "Sim" ? true : d.simples?.mei === "Não" ? false : null,
      data_mei: d.simples?.data_opcao_mei || null,
    };
  } catch (e) {
    console.log("fetchCnpjWs throw", e);
    return null;
  }
}

function formatPhoneBR(raw: string) {
  const cleaned = String(raw).replace(/\D/g, "");
  if (cleaned.length >= 10) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2)}`;
  }
  return raw;
}

/**
 * Scraper aprimorado: visita a home + páginas comuns de contato e extrai
 * múltiplos e-mails (incluindo mailto:), telefones e redes sociais.
 * Filtra e-mails genéricos (sentry, wixpress, no-reply, etc.).
 */
async function scrapeSiteDeep(rawUrl: string) {
  const result = {
    emails: [] as string[],
    phones: [] as string[],
    instagram: null as string | null,
    facebook: null as string | null,
    linkedin: null as string | null,
    youtube: null as string | null,
    tiktok: null as string | null,
    pages_visited: [] as string[],
  };

  let baseUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;

  let origin = "";
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return null;
  }

  const candidatePaths = [
    "",
    "/contato",
    "/contact",
    "/contact-us",
    "/fale-conosco",
    "/sobre",
    "/about",
    "/sobre-nos",
  ];
  const urls = Array.from(new Set(candidatePaths.map((p) => `${origin}${p}`)));

  const emailSet = new Set<string>();
  const phoneSet = new Set<string>();

  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      const resp = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LeadFinderBot/1.0; +https://lovable.dev)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      }).finally(() => clearTimeout(timer));

      if (!resp.ok) continue;
      const ctype = resp.headers.get("content-type") || "";
      if (!ctype.includes("text/html") && !ctype.includes("text/plain")) continue;

      const html = (await resp.text()).slice(0, 500_000);
      result.pages_visited.push(url);

      // mailto: tem prioridade
      for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
        const e = m[1].trim().toLowerCase();
        if (isUsableEmail(e)) emailSet.add(e);
      }
      // Regex genérica
      for (const m of html.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)) {
        const e = m[0].toLowerCase();
        if (isUsableEmail(e)) emailSet.add(e);
      }

      // Telefone BR
      for (const m of html.matchAll(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/g)) {
        const cleaned = m[0].replace(/\D/g, "").replace(/^55/, "");
        if (cleaned.length >= 10 && cleaned.length <= 11) {
          phoneSet.add(`(${cleaned.substring(0, 2)}) ${cleaned.substring(2)}`);
        }
      }

      // Redes sociais (primeira ocorrência válida)
      if (!result.instagram) {
        const ig = html.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})/i);
        if (ig && !/\/(p|reel|explore|accounts|tv|stories)\b/i.test(ig[0])) {
          result.instagram = `@${ig[1]}`;
        }
      }
      if (!result.facebook) {
        const fb = html.match(/(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9.\-_]{2,})/i);
        if (fb && !/\/(sharer|plugins|tr|dialog|login)\b/i.test(fb[0])) {
          result.facebook = fb[1];
        }
      }
      if (!result.linkedin) {
        const li = html.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/([A-Za-z0-9._-]{2,})/i);
        if (li) result.linkedin = li[0].startsWith("http") ? li[0] : `https://${li[0]}`;
      }
      if (!result.youtube) {
        const yt = html.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)([A-Za-z0-9._-]{2,})/i);
        if (yt) result.youtube = yt[0].startsWith("http") ? yt[0] : `https://${yt[0]}`;
      }
      if (!result.tiktok) {
        const tk = html.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([A-Za-z0-9._-]{2,})/i);
        if (tk) result.tiktok = `@${tk[1]}`;
      }
    } catch (e) {
      // segue para a próxima URL
    }
  }

  result.emails = Array.from(emailSet).slice(0, 10);
  result.phones = Array.from(phoneSet).slice(0, 5);
  return result;
}

function isUsableEmail(email: string): boolean {
  if (!email || email.length > 120) return false;
  // Bloquear lixos comuns / assets / serviços técnicos
  if (/@(?:sentry|wixpress|example|.*\.png|.*\.jpg|.*\.svg)/i.test(email)) return false;
  if (/(?:noreply|no-reply|do-not-reply|donotreply)@/i.test(email)) return false;
  if (/(?:@2x|@3x|\.(?:png|jpe?g|svg|gif|webp))$/i.test(email)) return false;
  if (/(?:wordpress|wpengine|gravatar|cloudflare|gstatic|googleusercontent)/i.test(email)) return false;
  return true;
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
      model: "google/gemini-3.6-flash",
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
    throw new Error(`Lovable AI ${resp.status}: ${t.slice(0, 200)}`);
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

/**
 * Scraping da busca pública do casadosdados.com.br para descobrir o CNPJ
 * a partir do nome do estabelecimento + cidade. Não requer API key.
 * Retorna apenas o CNPJ (14 dígitos formatados) ou null.
 */
async function scrapeCasaDosDadosPublic(
  name: string,
  address?: string | null
): Promise<string | null> {
  try {
    const cleanName = (name || "").trim();
    if (!cleanName) return null;

    // Extrai cidade/UF do endereço quando possível ("..., Cidade - UF, ...")
    let cidade: string | null = null;
    let uf: string | null = null;
    if (address) {
      const ufMatch = address.match(/\b([A-Z]{2})\b/);
      if (ufMatch) uf = ufMatch[1];
      const cidadeMatch = address.match(/,\s*([^,\-]+?)\s*-\s*[A-Z]{2}/);
      if (cidadeMatch) cidade = cidadeMatch[1].trim();
    }

    // Estratégia: replicar o que o usuário faria manualmente no Google —
    // pesquisar "Nome, Cidade, CNPJ" e capturar o primeiro CNPJ da página
    // de resultados. Como o Google bloqueia bots, usamos motores que
    // expõem HTML público (DuckDuckGo HTML e Bing).
    const termo = [cleanName, cidade, uf, "CNPJ"].filter(Boolean).join(" ");
    const q = encodeURIComponent(termo);

    const candidates: Array<{ url: string; headers?: Record<string, string> }> = [
      {
        url: `https://html.duckduckgo.com/html/?q=${q}`,
        headers: { "Content-Type": "text/html" },
      },
      { url: `https://duckduckgo.com/html/?q=${q}` },
      { url: `https://www.bing.com/search?q=${q}&setlang=pt-BR&cc=br` },
    ];

    const cnpjRegex = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;
    const cnpj14Regex = /\b\d{14}\b/;

    for (const c of candidates) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const resp = await fetch(c.url, {
          signal: ctrl.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
            ...(c.headers || {}),
          },
          redirect: "follow",
        }).finally(() => clearTimeout(timer));

        if (!resp.ok) {
          console.log("CNPJ web search HTTP", resp.status, c.url);
          continue;
        }
        const html = (await resp.text()).slice(0, 800_000);

        const m = html.match(cnpjRegex);
        if (m) {
          console.log("CNPJ encontrado via", c.url, m[0]);
          return m[0];
        }
        const m2 = html.match(cnpj14Regex);
        if (m2) {
          const d = m2[0];
          const formatted = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
          console.log("CNPJ (14 dígitos) via", c.url, formatted);
          return formatted;
        }
      } catch (e) {
        console.log("CNPJ web search throw", c.url, (e as any)?.message);
      }
    }

    return null;
  } catch (e) {
    console.log("scrapeCasaDosDadosPublic throw", e);
    return null;
  }
}