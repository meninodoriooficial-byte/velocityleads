// =====================================================================
// SMART CNPJ DISCOVERY — Providers de busca (descoberta de candidatos)
// =====================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CnpjCandidate, DiscoveryInput, ISearchProvider, ProviderError } from "../types.ts";
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
    const cxMatch = cfg?.description?.match(/cx=([\w:-]+)/);
    if (!key || !cxMatch) return null;
    return { key, cx: cxMatch[1] };
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

export function createInternalApisProvider(supabase: SupabaseClient): ISearchProvider {
  return {
    slug: "internal_apis",
    displayName: "APIs internas existentes",

    async isConfigured() {
      const cnpja = await getSharedCredential(supabase, "enrich_cnpja");
      const { data } = await supabase
        .from("api_configs")
        .select("key_name")
        .in("key_name", ["CNPJA_TOKEN", "OPENAI_API_KEY"])
        .eq("is_active", true);
      return !!cnpja || (data?.length ?? 0) > 0;
    },

    async discover(input: DiscoveryInput): Promise<CnpjCandidate[]> {
      // Ponto de integração (Fase 4): reaproveitar aqui exatamente as funções
      // cnpjaSearchByName / openaiGuessCnpj já existentes em
      // supabase/functions/enrich-lead/index.ts, extraídas para não duplicar.
      return [];
    },

    async testConnection() {
      const configured = await this.isConfigured();
      return {
        ok: configured,
        message: configured ? "APIs internas (CNPJá/OpenAI) configuradas" : "Nenhuma API interna configurada",
        latencyMs: 0,
      };
    },
  };
}
