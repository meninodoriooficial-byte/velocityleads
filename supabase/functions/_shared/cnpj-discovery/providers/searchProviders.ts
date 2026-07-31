// =====================================================================
// SMART CNPJ DISCOVERY — Providers de busca (descoberta de candidatos)
// =====================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CnpjCandidate, CnpjRecord, DiscoveryInput, ISearchProvider, ProviderError } from "../types.ts";
import { extractCnpjsFromText } from "../normalize.ts";
import { buildDiscoveryQueries } from "../queryBuilder.ts";

async function fetchWithAbort(url: string, init: RequestInit, signal: AbortSignal, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

async function getSharedCredential(
  supabase: SupabaseClient,
  providerName: string,
): Promise<string | null> {
  try {
    const { data } = await supabase.rpc("get_provider_keys_decrypted", { _provider: providerName });
    return (data?.[0]?.api_key as string | undefined) ?? null;
  } catch (_e) {
    return null;
  }
}

function createGoogleCseProvider(
  slug: "google_programmable_search" | "google_custom_search",
  displayName: string,
  supabase: SupabaseClient,
): ISearchProvider {
  async function getCredentials(): Promise<{ key: string; cx: string } | null> {
    const { data: cfg } = await supabase
      .from("api_configs")
      .select("description")
      .eq("provider", slug)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();

    const key = await getSharedCredential(supabase, slug);
    // Pega TODOS os "cx=..." da descrição, ignora o placeholder de ajuda
    // ("SEU_CX_AQUI") e usa o último valor real. Isso evita capturar o
    // exemplo que aparece no texto de instrução antes do cx verdadeiro.
    const cxAll = [...(cfg?.description?.matchAll(/cx=([\w:-]+)/g) ?? [])]
      .map((m) => m[1])
      .filter((v) => v && v !== "SEU_CX_AQUI");
    const cx = cxAll.length ? cxAll[cxAll.length - 1] : undefined;
    if (!key || !cx) return null;
    return { key, cx };
  }

  return {
    slug,
    displayName,

    async isConfigured() {
      return (await getCredentials()) !== null;
    },

    async discover(input: DiscoveryInput, signal: AbortSignal): Promise<CnpjCandidate[]> {
      const creds = await getCredentials();
      if (!creds) throw new ProviderError(slug, "invalid_key", "credencial ou cx não configurado");

      const queries = buildDiscoveryQueries(input).slice(0, 3);
      const candidates: CnpjCandidate[] = [];

      for (const q of queries) {
        const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(creds.key)}&cx=${encodeURIComponent(creds.cx)}&q=${encodeURIComponent(q)}`;
        const res = await fetchWithAbort(url, {}, signal).catch((e) => {
          throw new ProviderError(slug, "timeout", String(e));
        });

        if (res.status === 429) throw new ProviderError(slug, "quota", "cota diária excedida");
        if (!res.ok) throw new ProviderError(slug, "http", `HTTP ${res.status}`);

        const data = await res.json();
        const text = (data.items || [])
          .map((item: any) => `${item.title ?? ""} ${item.snippet ?? ""}`)
          .join(" ");
        const found = extractCnpjsFromText(text);
        candidates.push(...found.map((cnpj) => ({ cnpj, sourceProvider: slug, sourceUrl: data.items?.[0]?.link })));
        if (candidates.length > 0) break;
      }
      return candidates;
    },

    async testConnection() {
      const start = Date.now();
      const creds = await getCredentials();
      if (!creds) return { ok: false, message: "Credencial ou cx não configurado", latencyMs: Date.now() - start };
      try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(creds.key)}&cx=${encodeURIComponent(creds.cx)}&q=teste`;
        const res = await fetchWithAbort(url, {}, new AbortController().signal, 5000);
        if (res.ok) return { ok: true, message: "Conexão OK", latencyMs: Date.now() - start };
        // Traz o motivo real que o Google devolveu, em vez de só o código HTTP.
        const bodyText = await res.text().catch(() => "");
        let detail = bodyText;
        try {
          const parsed = JSON.parse(bodyText);
          detail = parsed?.error?.message || bodyText;
        } catch (_e) {
          // corpo não era JSON, usa o texto cru mesmo
        }
        return { ok: false, message: `HTTP ${res.status}: ${detail}`.slice(0, 300), latencyMs: Date.now() - start };
      } catch (e) {
        return { ok: false, message: String(e), latencyMs: Date.now() - start };
      }
    },
  };
}

export function createGoogleProgrammableSearchProvider(supabase: SupabaseClient): ISearchProvider {
  return createGoogleCseProvider("google_programmable_search", "Google Programmable Search", supabase);
}

export function createGoogleCustomSearchProvider(supabase: SupabaseClient): ISearchProvider {
  return createGoogleCseProvider("google_custom_search", "Google Custom Search JSON API", supabase);
}

export function createSerpApiProvider(supabase: SupabaseClient): ISearchProvider {
  return {
    slug: "serpapi",
    displayName: "SerpAPI",

    async isConfigured() {
      return (await getSharedCredential(supabase, "serpapi")) !== null;
    },

    async discover(input: DiscoveryInput, signal: AbortSignal): Promise<CnpjCandidate[]> {
      const key = await getSharedCredential(supabase, "serpapi");
      if (!key) throw new ProviderError("serpapi", "invalid_key", "chave não configurada");

      const queries = buildDiscoveryQueries(input).slice(0, 2);
      const candidates: CnpjCandidate[] = [];

      for (const q of queries) {
        const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&gl=br&hl=pt-br&api_key=${encodeURIComponent(key)}`;
        const res = await fetchWithAbort(url, {}, signal).catch((e) => {
          throw new ProviderError("serpapi", "timeout", String(e));
        });
        if (res.status === 429) throw new ProviderError("serpapi", "quota", "cota mensal excedida");
        if (!res.ok) throw new ProviderError("serpapi", "http", `HTTP ${res.status}`);

        const data = await res.json();
        const text = (data.organic_results || [])
          .map((r: any) => `${r.title ?? ""} ${r.snippet ?? ""}`)
          .join(" ");
        candidates.push(...extractCnpjsFromText(text).map((cnpj) => ({ cnpj, sourceProvider: "serpapi" })));
        if (candidates.length > 0) break;
      }
      return candidates;
    },

    async testConnection() {
      const start = Date.now();
      const key = await getSharedCredential(supabase, "serpapi");
      if (!key) return { ok: false, message: "Chave não configurada", latencyMs: Date.now() - start };
      try {
        const res = await fetchWithAbort(
          `https://serpapi.com/account.json?api_key=${encodeURIComponent(key)}`,
          {},
          new AbortController().signal,
          5000,
        );
        return { ok: res.ok, message: res.ok ? "Conexão OK" : `HTTP ${res.status}`, latencyMs: Date.now() - start };
      } catch (e) {
        return { ok: false, message: String(e), latencyMs: Date.now() - start };
      }
    },
  };
}

export function createDataForSeoProvider(supabase: SupabaseClient): ISearchProvider {
  return {
    slug: "dataforseo",
    displayName: "DataForSEO",

    async isConfigured() {
      const cred = await getSharedCredential(supabase, "dataforseo");
      return !!cred && cred.includes(":");
    },

    async discover(input: DiscoveryInput, signal: AbortSignal): Promise<CnpjCandidate[]> {
      const cred = await getSharedCredential(supabase, "dataforseo");
      if (!cred || !cred.includes(":")) {
        throw new ProviderError("dataforseo", "invalid_key", "credencial deve estar no formato login:senha");
      }
      const auth = btoa(cred);
      const query = buildDiscoveryQueries(input)[0];
      if (!query) return [];

      const res = await fetchWithAbort(
        "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
        {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify([{ keyword: query, location_code: 2076, language_code: "pt-BR" }]),
        },
        signal,
      ).catch((e) => {
        throw new ProviderError("dataforseo", "timeout", String(e));
      });

      if (res.status === 401) throw new ProviderError("dataforseo", "invalid_key", "credencial inválida");
      if (!res.ok) throw new ProviderError("dataforseo", "http", `HTTP ${res.status}`);

      const data = await res.json();
      const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
      const text = items.map((i: any) => `${i.title ?? ""} ${i.description ?? ""}`).join(" ");
      return extractCnpjsFromText(text).map((cnpj) => ({ cnpj, sourceProvider: "dataforseo" }));
    },

    async testConnection() {
      const start = Date.now();
      const cred = await getSharedCredential(supabase, "dataforseo");
      if (!cred || !cred.includes(":")) {
        return { ok: false, message: "Credencial deve estar no formato login:senha", latencyMs: Date.now() - start };
      }
      try {
        const res = await fetchWithAbort(
          "https://api.dataforseo.com/v3/user",
          { headers: { Authorization: `Basic ${btoa(cred)}` } },
          new AbortController().signal,
          5000,
        );
        return { ok: res.ok, message: res.ok ? "Conexão OK" : `HTTP ${res.status}`, latencyMs: Date.now() - start };
      } catch (e) {
        return { ok: false, message: String(e), latencyMs: Date.now() - start };
      }
    },
  };
}

export function createZenRowsProvider(supabase: SupabaseClient): ISearchProvider {
  return {
    slug: "zenrows",
    displayName: "ZenRows",

    async isConfigured() {
      return (await getSharedCredential(supabase, "zenrows")) !== null;
    },

    async discover(input: DiscoveryInput, signal: AbortSignal): Promise<CnpjCandidate[]> {
      const key = await getSharedCredential(supabase, "zenrows");
      if (!key) throw new ProviderError("zenrows", "invalid_key", "chave não configurada");

      const query = buildDiscoveryQueries(input)[0];
      if (!query) return [];
      const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&gl=br&hl=pt-br`;
      const url = `https://api.zenrows.com/v1/?apikey=${encodeURIComponent(key)}&url=${encodeURIComponent(targetUrl)}&js_render=true`;

      const res = await fetchWithAbort(url, {}, signal, 15000).catch((e) => {
        throw new ProviderError("zenrows", "timeout", String(e));
      });
      if (res.status === 401 || res.status === 403) throw new ProviderError("zenrows", "invalid_key", "credencial inválida");
      if (res.status === 429) throw new ProviderError("zenrows", "quota", "cota excedida");
      if (!res.ok) throw new ProviderError("zenrows", "http", `HTTP ${res.status}`);

      const html = await res.text();
      return extractCnpjsFromText(html).map((cnpj) => ({ cnpj, sourceProvider: "zenrows" }));
    },

    async testConnection() {
      const start = Date.now();
      const key = await getSharedCredential(supabase, "zenrows");
      if (!key) return { ok: false, message: "Chave não configurada", latencyMs: Date.now() - start };
      try {
        const res = await fetchWithAbort(
          `https://api.zenrows.com/v1/?apikey=${encodeURIComponent(key)}&url=${encodeURIComponent("https://httpbin.org/get")}`,
          {},
          new AbortController().signal,
          8000,
        );
        return { ok: res.ok, message: res.ok ? "Conexão OK" : `HTTP ${res.status}`, latencyMs: Date.now() - start };
      } catch (e) {
        return { ok: false, message: String(e), latencyMs: Date.now() - start };
      }
    },
  };
}

export function createBrightDataProvider(supabase: SupabaseClient): ISearchProvider {
  return {
    slug: "bright_data",
    displayName: "Bright Data",

    async isConfigured() {
      return (await getSharedCredential(supabase, "bright_data")) !== null;
    },

    async discover(input: DiscoveryInput, signal: AbortSignal): Promise<CnpjCandidate[]> {
      const token = await getSharedCredential(supabase, "bright_data");
      if (!token) throw new ProviderError("bright_data", "invalid_key", "token não configurado");

      const query = buildDiscoveryQueries(input)[0];
      if (!query) return [];
      const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&gl=br&hl=pt-br`;
      const url = `https://api.brightdata.com/serp/req?url=${encodeURIComponent(targetUrl)}`;

      const res = await fetchWithAbort(
        url,
        { headers: { Authorization: `Bearer ${token}` } },
        signal,
        15000,
      ).catch((e) => {
        throw new ProviderError("bright_data", "timeout", String(e));
      });
      if (res.status === 401 || res.status === 403) throw new ProviderError("bright_data", "invalid_key", "token inválido");
      if (res.status === 429) throw new ProviderError("bright_data", "quota", "cota excedida");
      if (!res.ok) throw new ProviderError("bright_data", "http", `HTTP ${res.status}`);

      const html = await res.text();
      return extractCnpjsFromText(html).map((cnpj) => ({ cnpj, sourceProvider: "bright_data" }));
    },

    async testConnection() {
      const start = Date.now();
      const token = await getSharedCredential(supabase, "bright_data");
      if (!token) return { ok: false, message: "Token não configurado", latencyMs: Date.now() - start };
      return {
        ok: false,
        message: "Teste automático ainda não validado contra a conta Bright Data do cliente — confirme o endpoint exato do plano contratado (Web Unlocker vs SERP API) antes de usar em produção.",
        latencyMs: Date.now() - start,
      };
    },
  };
}

// ---------------------------------------------------------------------
// Helpers do provider internal_apis — busca por NOME no CNPJá.
// Extraidos de enrich-lead/index.ts. IMPORTANTE: o parametro correto da
// API do CNPJa e "names.in" (o "search.term" antigo retorna HTTP 400,
// o que fazia a busca por nome falhar silenciosamente e cair no OpenAI).
// ---------------------------------------------------------------------
function extractUFInternal(address?: string | null): string | null {
  if (!address) return null;
  const m = address.match(/\b([A-Z]{2})\b(?!.*\b[A-Z]{2}\b)/);
  return m ? m[1] : null;
}

function searchNameVariationsInternal(name: string): string[] {
  const set = new Set<string>();
  set.add(name);
  const semSufixo = name.replace(/\s+(LTDA|ME|EPP|SA|EIRELI|S\/A)\s*$/i, "").trim();
  if (semSufixo && semSufixo !== name) set.add(semSufixo);
  const parts = name.split(/\s+/);
  if (parts.length > 2) set.add(parts.slice(0, -1).join(" "));
  if (parts.length > 3) set.add(parts.slice(0, -2).join(" "));
  return [...set].filter((s) => s.length >= 3);
}

function nameMatchInternal(registeredName: string, tradingName: string, searchName: string): boolean {
  const razao = (registeredName || "").toLowerCase();
  const fantasia = (tradingName || "").toLowerCase();
  const alvo = (searchName || "").toLowerCase();
  if (!alvo) return false;
  if (razao.includes(alvo) || fantasia.includes(alvo)) return true;
  const targetTokens = alvo.split(/\s+/).filter((w) => w.length >= 4);
  const sourceTokens = [...new Set([...razao.split(/\s+/), ...fantasia.split(/\s+/)])].filter((w) => w.length >= 4);
  if (targetTokens.length === 0) return true;
  const hits = targetTokens.filter((t) => sourceTokens.some((s) => s.includes(t) || t.includes(s))).length;
  return hits / targetTokens.length >= 0.5;
}

function mapCnpjaRecord(record: Record<string, unknown>, digits: string): CnpjRecord {
  const company = (record?.company ?? {}) as Record<string, unknown>;
  const address = (record?.address ?? {}) as Record<string, unknown>;
  return {
    cnpj: digits,
    razaoSocial: (company?.name as string) ?? null,
    nomeFantasia: (record?.alias as string) ?? null,
    cidade: (address?.city as string) ?? null,
    estado: (address?.state as string) ?? null,
    cep: (address?.zip as string) ?? null,
    rua: (address?.street as string) ?? null,
    numero: (address?.number as string) ?? null,
    bairro: (address?.district as string) ?? null,
  };
}

async function cnpjaSearchByNameInternal(
  name: string,
  uf: string | null,
  apiKey: string,
  signal: AbortSignal,
): Promise<CnpjCandidate[]> {
  if (!name) return [];
  const out: CnpjCandidate[] = [];
  const seen = new Set<string>();
  for (const term of searchNameVariationsInternal(name)) {
    if (signal.aborted) break;
    const params = new URLSearchParams();
    params.set("names.in", term);
    if (uf) params.set("address.state.in", uf);
    params.set("limit", "10");
    let resp: Response;
    try {
      resp = await fetch(`https://api.cnpja.com/office?${params.toString()}`, {
        headers: { Authorization: apiKey, Accept: "application/json" },
        signal,
      });
    } catch (_e) {
      continue;
    }
    if (!resp.ok) continue;
    const data = await resp.json().catch(() => null);
    const records: Array<Record<string, unknown>> = (data?.records || data?.data || []) as Array<Record<string, unknown>>;
    if (!Array.isArray(records) || records.length === 0) continue;
    for (const record of records) {
      const company = (record?.company ?? {}) as Record<string, unknown>;
      const raw = (record?.taxId ?? record?.cnpj ?? company?.taxId ?? null) as string | null;
      const digits = raw ? raw.toString().replace(/\D/g, "") : null;
      if (!digits || digits.length !== 14 || seen.has(digits)) continue;
      const razao = (company?.name as string) || "";
      const fantasia = (record?.alias as string) || "";
      if (!nameMatchInternal(razao, fantasia, name)) continue;
      seen.add(digits);
      out.push({
        cnpj: digits,
        sourceProvider: "internal_apis",
        sourceUrl: `https://api.cnpja.com/office/${digits}`,
        rawSnippet: `CNPJa: ${razao || fantasia}`,
        record: mapCnpjaRecord(record, digits),
      });
    }
    // Achou candidatos com este termo -> nao precisa testar variacoes mais amplas.
    if (out.length > 0) break;
  }
  return out;
}

export function createInternalApisProvider(supabase: SupabaseClient): ISearchProvider {
  return {
    slug: "internal_apis",
    displayName: "APIs internas (CNPJa busca por nome)",

    async isConfigured() {
      const cnpja = await getSharedCredential(supabase, "enrich_cnpja");
      return !!cnpja;
    },

    async discover(input: DiscoveryInput, signal: AbortSignal): Promise<CnpjCandidate[]> {
      const cnpja = await getSharedCredential(supabase, "enrich_cnpja");
      if (!cnpja) return [];
      const uf = input.state || extractUFInternal(input.address);
      // 1a tentativa com UF (mais preciso); se nao achar, Brasil inteiro.
      // Retorna TODOS os candidatos (ex: varias filiais) para o orquestrador
      // pontuar e escolher o que casa com o endereco do lead.
      let found = await cnpjaSearchByNameInternal(input.businessName, uf, cnpja, signal);
      if (found.length === 0) found = await cnpjaSearchByNameInternal(input.businessName, null, cnpja, signal);
      return found;
    },

    async testConnection() {
      const start = Date.now();
      const cnpja = await getSharedCredential(supabase, "enrich_cnpja");
      if (!cnpja) return { ok: false, message: "CNPJa nao configurado em Configuracoes de APIs", latencyMs: Date.now() - start };
      try {
        const resp = await fetchWithAbort(
          "https://api.cnpja.com/office?names.in=Magazine%20Luiza&limit=1",
          { headers: { Authorization: cnpja, Accept: "application/json" } },
          new AbortController().signal,
          10000,
        );
        if (resp.ok) return { ok: true, message: "CNPJa OK - busca por nome funcionando", latencyMs: Date.now() - start };
        const t = await resp.text().catch(() => "");
        return { ok: false, message: `CNPJa HTTP ${resp.status}: ${t}`.slice(0, 250), latencyMs: Date.now() - start };
      } catch (e) {
        return { ok: false, message: String(e), latencyMs: Date.now() - start };
      }
    },
  };
}
