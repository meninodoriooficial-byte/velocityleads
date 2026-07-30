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

    const sources: string[] = [];

    // Chaves das APIs de enriquecimento (lidas do cofre; só retornam se ativas)
    const cnpjaKey = await getDecryptedKey(supabase, "CNPJA_TOKEN");
    const receitawsKey = await getDecryptedKey(supabase, "RECEITAWS_TOKEN");
    const openaiKey = await getDecryptedKey(supabase, "OPENAI_API_KEY");
    const brasilApiOn = await isActive(supabase, "BRASILAPI_ENABLED");

    // =====================================================================
    // ETAPA 1 — Descobrir o CNPJ a partir do nome/endereço do lead.
    // Ordem: CNPJá busca (preciso) -> OpenAI (reforço), SEMPRE validando
    // o CNPJ contra a BrasilAPI para não aceitar palpite errado.
    // =====================================================================
    let cnpj: string | null = null;
    let cnpjSource = "";

    const existingCnpj = extractExistingCnpj(result);
    if (existingCnpj) { cnpj = existingCnpj; cnpjSource = "lead"; }

    if (!cnpj && cnpjaKey) {
      try {
        const found = await cnpjaSearchByName(result.business_name, extractUF(result.address), cnpjaKey);
        if (found) { cnpj = found; cnpjSource = "cnpja_search"; }
      } catch (e) { console.error("cnpja search error", e); }
    }

    if (!cnpj && openaiKey) {
      try {
        const guess = await openaiGuessCnpj(result, openaiKey);
        if (guess) {
          const valid = await validateCnpjMatchesName(guess, result.business_name);
          if (valid) { cnpj = guess; cnpjSource = "openai_validado"; }
        }
      } catch (e) { console.error("openai cnpj guess error", e); }
    }

    if (cnpj) sources.push(`cnpj:${cnpjSource}`);

    // =====================================================================
    // ETAPA 2 — Com o CNPJ, enriquecer em CASCATA/TRANSBORDO.
    // =====================================================================
    if (cnpj) {
      if (cnpjaKey) {
        try {
          const c = await cnpjaGetOffice(cnpj, cnpjaKey);
          if (c) { enrichment.cnpja = c; sources.push("cnpja"); }
        } catch (e) { console.error("cnpja office error", e); }
      }
      if (brasilApiOn) {
        try {
          const brasil = await fetchBrasilApi(cnpj);
          if (brasil) { enrichment.brasilapi = brasil; sources.push("brasilapi"); }
        } catch (e) { console.error("BrasilAPI error:", e); }
      }
      if (receitawsKey) {
        try {
          const rw = await fetchReceitaWs(cnpj, receitawsKey);
          if (rw) { enrichment.receitaws = rw; sources.push("receitaws"); }
        } catch (e) { console.error("ReceitaWS error:", e); }
      }
    }

    // =====================================================================
    // ETAPA 3 — Consolidar + scraping do site + OpenAI marketing
    // =====================================================================
    const consolidated = consolidateCnpjData(enrichment);
    if (consolidated) enrichment.consolidado = consolidated;

    const siteUrl = result.website || (consolidated as any)?.site || null;
    if (siteUrl) {
      try {
        const scraped = await scrapeSiteDeep(siteUrl);
        if (scraped && (scraped.emails?.length || scraped.phones?.length || scraped.instagram || scraped.facebook || scraped.linkedin)) {
          enrichment.scraped = scraped;
          sources.push("scrape");
        }
      } catch (e) { console.error("scrape error:", e); }
    }

    let aiError: string | null = null;
    if (openaiKey) {
      try {
        const customPrompt = await getSystemSetting(supabase, "ai_enrichment_prompt");
        const aiData = await fetchAIEnrichmentOpenAI(result, openaiKey, customPrompt);
        if (aiData) { enrichment.ai = aiData; sources.push("ai"); }
      } catch (e: any) {
        aiError = e?.message || String(e);
        console.error("AI enrichment error:", e);
      }
    } else {
      aiError = "OpenAI não configurada/ativa";
    }

    sourceUsed = sources.join("+");

    if (!sourceUsed) {
      return new Response(
        JSON.stringify({
          success: false,
          source: "none",
          error: aiError
            ? `Não foi possível enriquecer este lead: ${aiError}`
            : "Nenhum dado adicional encontrado. Verifique se ao menos uma API de enriquecimento (CNPJá, ReceitaWS, BrasilAPI ou OpenAI) está ativa.",
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
  const con = enrichment.consolidado as any;
  const scraped = enrichment.scraped as any;
  const ai = enrichment.ai as any;
  const update: Record<string, any> = {
    enriched_data: enrichment,
    enriched_at: new Date().toISOString(),
    enriched_source: sourceUsed,
  };
  // Dados cadastrais consolidados (CNPJ, sócios, contatos da Receita)
  if (con) {
    if (!result.phone && con.telefone) update.phone = con.telefone;
    if (!result.email && con.email) update.email = con.email;
    if (!result.owner_name && con.proprietario) update.owner_name = con.proprietario;
  }
  if (scraped) {
    if (!update.email && !result.email && scraped.emails?.[0]) update.email = scraped.emails[0];
    if (!update.phone && !result.phone && scraped.phones?.[0]) update.phone = scraped.phones[0];
    const social = { ...(update.social_media || result.social_media || {}) };
    let changed = false;
    for (const k of ["instagram", "facebook", "linkedin", "youtube", "tiktok"] as const) {
      if (!social[k] && (scraped as any)[k]) { social[k] = (scraped as any)[k]; changed = true; }
    }
    if (changed) update.social_media = social;
  }
  if (ai) {
    if (!update.email && !result.email && Array.isArray(ai.emails) && ai.emails[0]) update.email = ai.emails[0];
    if (!update.phone && !result.phone && Array.isArray(ai.telefones) && ai.telefones[0]) update.phone = ai.telefones[0];
    if (!result.website && ai.site) update.website = ai.site;
    const social = { ...(update.social_media || result.social_media || {}) };
    let changed = false;
    const socials = ai.redes_sociais || {};
    for (const k of ["instagram", "facebook", "linkedin", "youtube", "tiktok"]) {
      if (!social[k] && socials[k]) { social[k] = socials[k]; changed = true; }
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
          "User-Agent": "Mozilla/5.0 (compatible; LeadFinderBot/1.0; +https://velocityleads.com.br)",
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
// ============================================================================
// NOVOS HELPERS — enriquecimento em cascata (CNPJá, ReceitaWS, OpenAI)
// ============================================================================

/** Verifica se uma api_config está ativa (para fontes sem chave, ex. BrasilAPI). */
async function isActive(supabase: any, keyName: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("api_configs")
      .select("is_active")
      .eq("key_name", keyName)
      .maybeSingle();
    return !!data?.is_active;
  } catch { return false; }
}

/** Extrai CNPJ já salvo no lead (colunas ou enriched_data anterior). */
function extractExistingCnpj(result: any): string | null {
  const candidates = [
    result?.cnpj,
    result?.enriched_data?.cnpj,
    result?.enriched_data?.consolidado?.cnpj,
    result?.enriched_data?.cnpja?.cnpj,
    result?.enriched_data?.brasilapi?.cnpj,
  ];
  for (const c of candidates) {
    const d = (c || "").toString().replace(/\D/g, "");
    if (d.length === 14) return d;
  }
  return null;
}

/** CNPJá — busca o escritório por razão social + UF, retorna o CNPJ (14 dígitos). */
async function cnpjaSearchByName(name: string, uf: string | null, apiKey: string): Promise<string | null> {
  if (!name) return null;
  const params = new URLSearchParams();
  params.set("search.term", name);
  if (uf) params.set("address.state.in", uf);
  params.set("limit", "5");
  const url = `https://api.cnpja.com/office?${params.toString()}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  const resp = await fetch(url, {
    headers: { Authorization: apiKey, Accept: "application/json" },
    signal: ctrl.signal,
  }).finally(() => clearTimeout(t));
  if (!resp.ok) { console.log("cnpja search HTTP", resp.status); return null; }
  const data = await resp.json();
  const records = data?.records || data?.data || [];
  const first = Array.isArray(records) ? records[0] : null;
  const raw = first?.taxId || first?.cnpj || first?.company?.taxId || null;
  const digits = raw ? raw.toString().replace(/\D/g, "") : null;
  return digits && digits.length === 14 ? digits : null;
}

/** CNPJá — dados cadastrais completos a partir do CNPJ. */
async function cnpjaGetOffice(cnpjDigits: string, apiKey: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  const resp = await fetch(`https://api.cnpja.com/office/${cnpjDigits}`, {
    headers: { Authorization: apiKey, Accept: "application/json" },
    signal: ctrl.signal,
  }).finally(() => clearTimeout(t));
  if (!resp.ok) { console.log("cnpja office HTTP", resp.status); return null; }
  const d = await resp.json();
  const company = d.company || {};
  const socios = (company.members || []).map((m: any) => ({
    nome: m?.person?.name || null,
    qualificacao: m?.role?.text || null,
  }));
  const ie = (d.registrations || []).find((r: any) => r?.enabled) || (d.registrations || [])[0] || null;
  return {
    cnpj: d.taxId || cnpjDigits,
    razao_social: company.name || null,
    nome_fantasia: d.alias || null,
    capital_social: company.equity ?? null,
    natureza_juridica: company.nature?.text || null,
    porte: company.size?.text || null,
    situacao_cadastral: d.status?.text || null,
    data_abertura: d.founded || null,
    atividade_principal: d.mainActivity?.text || null,
    cnae_principal_codigo: d.mainActivity?.id || null,
    atividades_secundarias: (d.sideActivities || []).map((a: any) => a.text).filter(Boolean),
    endereco_completo: d.address
      ? [d.address.street, d.address.number, d.address.details, d.address.district, d.address.city, d.address.state, d.address.zip].filter(Boolean).join(", ")
      : null,
    telefone: (d.phones || [])[0] ? `(${d.phones[0].area}) ${d.phones[0].number}` : null,
    email: (d.emails || [])[0]?.address || null,
    socios,
    proprietario: socios?.[0]?.nome || null,
    inscricao_estadual: ie ? `${ie.number}${ie.state ? ` (${ie.state})` : ""}` : null,
    opcao_pelo_simples: d.company?.simples?.optant ?? null,
    opcao_pelo_mei: d.company?.simei?.optant ?? null,
    tipo_empresa: company.nature?.text || company.size?.text || null,
  };
}

/** ReceitaWS — consulta CNPJ (usa token Bearer se houver). */
async function fetchReceitaWs(cnpjDigits: string, apiKey: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  const resp = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpjDigits}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: ctrl.signal,
  }).finally(() => clearTimeout(t));
  if (!resp.ok) { console.log("receitaws HTTP", resp.status); return null; }
  const d = await resp.json();
  if (d?.status === "ERROR") { console.log("receitaws ERROR", d?.message); return null; }
  const socios = (d.qsa || []).map((s: any) => ({ nome: s.nome, qualificacao: s.qual }));
  return {
    cnpj: d.cnpj || cnpjDigits,
    razao_social: d.nome || null,
    nome_fantasia: d.fantasia || null,
    situacao_cadastral: d.situacao || null,
    data_abertura: d.abertura || null,
    capital_social: d.capital_social || null,
    porte: d.porte || null,
    natureza_juridica: d.natureza_juridica || null,
    atividade_principal: d.atividade_principal?.[0]?.text || null,
    atividades_secundarias: (d.atividades_secundarias || []).map((a: any) => a.text).filter(Boolean),
    endereco_completo: [d.logradouro, d.numero, d.complemento, d.bairro, d.municipio, d.uf, d.cep].filter(Boolean).join(", "),
    email: d.email || null,
    telefone: d.telefone || null,
    socios,
    proprietario: socios?.[0]?.nome || null,
    opcao_pelo_simples: d.simples?.optante ?? null,
    opcao_pelo_mei: d.simei?.optante ?? null,
    tipo_empresa: d.tipo || d.natureza_juridica || null,
  };
}

/** OpenAI — infere o CNPJ a partir do nome/endereço (será validado depois). */
async function openaiGuessCnpj(result: any, apiKey: string): Promise<string | null> {
  const prompt = `Empresa: ${result.business_name}\nEndereço: ${result.address || "—"}\nTelefone: ${result.phone || "—"}\nSite: ${result.website || "—"}\n\nCom base em informações públicas, qual é o CNPJ desta empresa? Responda APENAS com o CNPJ (14 dígitos, só números) se tiver alta confiança. Se não souber, responda exatamente "null".`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Você identifica CNPJs de empresas brasileiras a partir de dados públicos. Só responde com alta confiança." },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 30,
    }),
  });
  if (!resp.ok) { console.log("openai guess HTTP", resp.status); return null; }
  const data = await resp.json();
  const text = (data?.choices?.[0]?.message?.content || "").trim();
  const digits = text.replace(/\D/g, "");
  return digits.length === 14 ? digits : null;
}

/** Valida se o CNPJ corresponde ao nome buscado, via BrasilAPI (grátis). */
async function validateCnpjMatchesName(cnpjDigits: string, name: string): Promise<boolean> {
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, { headers: { Accept: "application/json" } });
    if (!resp.ok) return false;
    const d = await resp.json();
    const razao = (d.razao_social || "").toLowerCase();
    const fantasia = (d.nome_fantasia || "").toLowerCase();
    const alvo = (name || "").toLowerCase();
    if (!alvo) return false;
    // Considera válido se houver interseção de tokens relevantes (>=1 palavra com 4+ letras).
    const tokens = alvo.split(/\s+/).filter((w) => w.length >= 4);
    return tokens.some((w) => razao.includes(w) || fantasia.includes(w));
  } catch { return false; }
}

/** Consolida os dados de CNPJ das várias fontes (transbordo: preenche o vazio). */
function consolidateCnpjData(enrichment: Record<string, any>) {
  const sources = [enrichment.cnpja, enrichment.brasilapi, enrichment.receitaws].filter(Boolean);
  if (sources.length === 0) return null;
  const pick = (field: string) => {
    for (const s of sources) {
      const v = (s as any)?.[field];
      if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) return v;
    }
    return null;
  };
  // Sócios: usa a lista mais completa
  let socios: any[] = [];
  for (const s of sources) {
    const arr = (s as any)?.socios || [];
    if (Array.isArray(arr) && arr.length > socios.length) socios = arr;
  }
  return {
    cnpj: pick("cnpj"),
    razao_social: pick("razao_social"),
    nome_fantasia: pick("nome_fantasia"),
    inscricao_estadual: pick("inscricao_estadual"),
    capital_social: pick("capital_social"),
    natureza_juridica: pick("natureza_juridica"),
    porte: pick("porte"),
    tipo_empresa: pick("tipo_empresa"),
    situacao_cadastral: pick("situacao_cadastral"),
    data_abertura: pick("data_abertura"),
    atividade_principal: pick("atividade_principal"),
    atividades_secundarias: pick("atividades_secundarias") || [],
    endereco_completo: pick("endereco_completo"),
    email: pick("email"),
    telefone: pick("telefone"),
    opcao_pelo_simples: pick("opcao_pelo_simples"),
    opcao_pelo_mei: pick("opcao_pelo_mei"),
    socios,
    proprietario: pick("proprietario"),
  };
}

/** OpenAI — enriquecimento de marketing (descrição, pitch, redes). */
async function fetchAIEnrichmentOpenAI(result: any, apiKey: string, customSystemPrompt?: string | null) {
  const systemPrompt = (customSystemPrompt && customSystemPrompt.trim().length > 0)
    ? customSystemPrompt
    : "Você é um analista de dados B2B brasileiro. Retorne apenas dados plausíveis baseados em informações públicas conhecidas. Se não souber, deixe null.";
  const prompt = `Dados da empresa:\nNome: ${result.business_name}\nTipo: ${result.business_type || "—"}\nEndereço: ${result.address || "—"}\nSite: ${result.website || "—"}\nTelefone: ${result.phone || "—"}\n\nRetorne um JSON com: descricao (1-2 frases), segmento, porte_estimado (MEI/Pequeno/Médio/Grande/Desconhecido), publico_alvo, produtos_servicos (array), diferenciais (array), pitch_abordagem (frase curta), redes_sociais (objeto com instagram/facebook/linkedin/youtube/tiktok), emails (array), telefones (array), site. Responda APENAS o JSON, sem markdown.`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Rate limit da OpenAI excedido.");
    if (resp.status === 401) throw new Error("Chave OpenAI inválida.");
    const t = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${t.slice(0, 150)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;
  try { return JSON.parse(content); } catch { return null; }
}
