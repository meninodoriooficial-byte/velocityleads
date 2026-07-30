// =====================================================================
// SMART CNPJ DISCOVERY — Providers de validação: BrasilAPI e ReceitaWS
// =====================================================================
import { CnpjCandidate, CnpjRecord, DiscoveryInput, ISearchProvider, ProviderError } from "../types.ts";
import { extractCnpjsFromText, onlyDigits } from "../normalize.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

async function fetchWithTimeout(url: string, init: RequestInit, signal: AbortSignal, timeoutMs = 8000) {
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

export function createBrasilApiProvider(): ISearchProvider {
  return {
    slug: "brasilapi",
    displayName: "BrasilAPI",

    async isConfigured() {
      return true;
    },

    async discover(input: DiscoveryInput, signal: AbortSignal): Promise<CnpjCandidate[]> {
      const found = extractCnpjsFromText(
        [input.businessName, input.website, input.address].filter(Boolean).join(" "),
      );
      return found.map((cnpj) => ({ cnpj, sourceProvider: "brasilapi" }));
    },

    async testConnection() {
      const start = Date.now();
      try {
        const res = await fetchWithTimeout(
          "https://brasilapi.com.br/api/cnpj/v1/00000000000191",
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

export async function validateWithBrasilApi(cnpj: string, signal: AbortSignal): Promise<CnpjRecord | null> {
  const digits = onlyDigits(cnpj);
  const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {}, signal, 8000).catch(
    (e) => {
      throw new ProviderError("brasilapi", "timeout", String(e));
    },
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    if (res.status === 429) throw new ProviderError("brasilapi", "quota", "rate limit atingido");
    throw new ProviderError("brasilapi", "http", `HTTP ${res.status}`);
  }
  const data = await res.json();
  return {
    cnpj: digits,
    razaoSocial: data.razao_social ?? null,
    nomeFantasia: data.nome_fantasia ?? null,
    telefone: (data.ddd_telefone_1 as string) || null,
    website: null,
    cidade: data.municipio ?? null,
    estado: data.uf ?? null,
    cep: data.cep ?? null,
    rua: data.logradouro ?? null,
    numero: data.numero ?? null,
    bairro: data.bairro ?? null,
    categoria: data.cnae_fiscal_descricao ?? null,
  };
}

export function createReceitaWsProvider(supabase: SupabaseClient): ISearchProvider {
  return {
    slug: "receitaws",
    displayName: "ReceitaWS",

    async isConfigured() {
      return true;
    },

    async discover(input: DiscoveryInput): Promise<CnpjCandidate[]> {
      const found = extractCnpjsFromText(
        [input.businessName, input.website, input.address].filter(Boolean).join(" "),
      );
      return found.map((cnpj) => ({ cnpj, sourceProvider: "receitaws" }));
    },

    async testConnection() {
      const start = Date.now();
      try {
        const res = await fetchWithTimeout(
          "https://www.receitaws.com.br/v1/cnpj/00000000000191",
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

export async function validateWithReceitaWs(
  cnpj: string,
  signal: AbortSignal,
  supabase: SupabaseClient,
): Promise<CnpjRecord | null> {
  const digits = onlyDigits(cnpj);

  // Reaproveita token compartilhado se estiver configurado em api_configs
  // (provider = 'enrich_receitaws' — mesmo nome já usado pelo enrich-lead atual)
  let token: string | undefined;
  try {
    const { data: keys } = await supabase.rpc("get_provider_keys_decrypted", { _provider: "enrich_receitaws" });
    token = keys?.[0]?.api_key as string | undefined;
  } catch (_e) {
    token = undefined;
  }

  const url = token
    ? `https://receitaws.com.br/v1/cnpj/${digits}?token=${encodeURIComponent(token)}`
    : `https://www.receitaws.com.br/v1/cnpj/${digits}`;

  const res = await fetchWithTimeout(url, {}, signal, 8000).catch((e) => {
    throw new ProviderError("receitaws", "timeout", String(e));
  });

  if (res.status === 429) throw new ProviderError("receitaws", "quota", "rate limit atingido (3 req/min no plano free)");
  if (!res.ok) throw new ProviderError("receitaws", "http", `HTTP ${res.status}`);

  const data = await res.json();
  if (data.status === "ERROR") return null;

  return {
    cnpj: digits,
    razaoSocial: data.nome ?? null,
    nomeFantasia: data.fantasia ?? null,
    telefone: data.telefone ?? null,
    website: null,
    cidade: data.municipio ?? null,
    estado: data.uf ?? null,
    cep: data.cep ?? null,
    rua: data.logradouro ?? null,
    numero: data.numero ?? null,
    bairro: data.bairro ?? null,
    categoria: data.atividade_principal?.[0]?.text ?? null,
  };
}
