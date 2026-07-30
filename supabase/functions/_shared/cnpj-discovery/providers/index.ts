// =====================================================================
// SMART CNPJ DISCOVERY — Factory de providers
// =====================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CnpjRecord, ISearchProvider } from "../types.ts";
import { createBrasilApiProvider, createReceitaWsProvider, validateWithBrasilApi, validateWithReceitaWs } from "./validators.ts";
import {
  createGoogleProgrammableSearchProvider,
  createGoogleCustomSearchProvider,
  createSerpApiProvider,
  createDataForSeoProvider,
  createZenRowsProvider,
  createBrightDataProvider,
  createInternalApisProvider,
} from "./searchProviders.ts";

const FACTORIES: Record<string, (supabase: SupabaseClient) => ISearchProvider> = {
  google_programmable_search: createGoogleProgrammableSearchProvider,
  google_custom_search: createGoogleCustomSearchProvider,
  brasilapi: () => createBrasilApiProvider(),
  receitaws: (supabase) => createReceitaWsProvider(supabase),
  internal_apis: createInternalApisProvider,
  serpapi: createSerpApiProvider,
  dataforseo: createDataForSeoProvider,
  zenrows: createZenRowsProvider,
  bright_data: createBrightDataProvider,
};

/**
 * Monta a lista de providers respeitando a ordem (sort_order) e o
 * liga/desliga cadastrados em cnpj_discovery_providers. Este é o único
 * lugar que o enrich-lead precisa chamar para obter a lista pronta.
 */
export async function buildProviderList(supabase: SupabaseClient): Promise<ISearchProvider[]> {
  const { data: rows } = await supabase
    .from("cnpj_discovery_providers")
    .select("slug, is_enabled")
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });

  const providers: ISearchProvider[] = [];
  for (const row of rows ?? []) {
    const factory = FACTORIES[row.slug];
    if (factory) providers.push(factory(supabase));
  }
  return providers;
}

/**
 * Validação oficial de um CNPJ candidato: tenta BrasilAPI primeiro
 * (mais estável, sem rate limit agressivo), cai para ReceitaWS se falhar.
 * Nunca lança — retorna null se ambos falharem, para o orchestrator
 * simplesmente descartar o candidato.
 */
export async function validateCnpj(
  cnpj: string,
  supabase: SupabaseClient,
): Promise<CnpjRecord | null> {
  const controller = new AbortController();
  try {
    const viaBrasilApi = await validateWithBrasilApi(cnpj, controller.signal);
    if (viaBrasilApi) return viaBrasilApi;
  } catch (e) {
    console.error("validateCnpj: BrasilAPI falhou, tentando ReceitaWS", e);
  }

  try {
    const viaReceitaWs = await validateWithReceitaWs(cnpj, controller.signal, supabase);
    if (viaReceitaWs) return viaReceitaWs;
  } catch (e) {
    console.error("validateCnpj: ReceitaWS também falhou", e);
  }

  return null;
}
