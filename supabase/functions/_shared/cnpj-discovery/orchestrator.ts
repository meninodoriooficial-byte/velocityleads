// =====================================================================
// SMART CNPJ DISCOVERY — Orquestrador
// Local sugerido: supabase/functions/_shared/cnpj-discovery/orchestrator.ts
//
// Este módulo é o ÚNICO ponto de entrada que o enrich-lead (ou qualquer
// outro caller) deve usar. Ele decide internamente: cache, learning,
// ordem dos providers, fallback, score e log. Nada disso vaza para quem
// chama — o caller só recebe um DiscoveryResult.
// =====================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CnpjCandidate,
  CnpjRecord,
  DiscoveryInput,
  DiscoveryResult,
  ISearchProvider,
  ProviderError,
  ScoredCandidate,
} from "./types.ts";
import { onlyDigits, canonicalName } from "./normalize.ts";
import { scoreCandidate, passesConfidenceThreshold } from "./score.ts";

const PROVIDER_TIMEOUT_MS = 8000;

export interface OrchestratorDeps {
  supabase: SupabaseClient;
  providers: ISearchProvider[]; // já instanciados, na ordem cadastrada em cnpj_discovery_providers
  validateCnpj: (cnpj: string) => Promise<CnpjRecord | null>; // validação oficial (BrasilAPI/ReceitaWS/internas)
}

export async function discoverCnpj(
  input: DiscoveryInput,
  deps: OrchestratorDeps,
): Promise<DiscoveryResult> {
  const start = Date.now();
  const { supabase } = deps;

  // -------------------------------------------------------------
  // 0. O add-on está ligado?
  // -------------------------------------------------------------
  const { data: settings } = await supabase
    .from("cnpj_discovery_settings")
    .select("is_enabled, min_confidence_score")
    .limit(1)
    .maybeSingle();

  if (!settings?.is_enabled) {
    return {
      cnpj: null,
      score: null,
      source: "none",
      reason: "add-on desativado",
      candidatesEvaluated: 0,
      durationMs: Date.now() - start,
    };
  }
  const minScore = settings.min_confidence_score ?? 60;

  // -------------------------------------------------------------
  // 1. Cache (PlaceID > telefone > website > nome+endereço)
  // -------------------------------------------------------------
  const cacheKeys: Array<{ type: string; key: string }> = [];
  if (input.placeId) cacheKeys.push({ type: "place_id", key: input.placeId });
  if (input.phone) cacheKeys.push({ type: "phone", key: onlyDigits(input.phone) });
  if (input.website) cacheKeys.push({ type: "website", key: input.website.toLowerCase() });
  cacheKeys.push({
    type: "name_address",
    key: `${canonicalName(input.businessName)}|${canonicalName(input.address)}`,
  });

  for (const { type, key } of cacheKeys) {
    const { data: cached } = await supabase
      .from("cnpj_discovery_cache")
      .select("cnpj, score")
      .eq("cache_type", type)
      .eq("cache_key", key)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      try {
        await supabase.rpc("increment_cnpj_discovery_cache_hit", { p_cache_type: type, p_cache_key: key });
      } catch (_e) {
        // não crítico
      }
      await logAttempt(supabase, { input, providerSlug: null, durationMs: Date.now() - start, cnpjsFound: 1, chosenCnpj: cached.cnpj, score: cached.score, reason: "cache hit", source: "cache" });
      return {
        cnpj: cached.cnpj,
        score: cached.score,
        source: "cache",
        reason: "encontrado em cache",
        candidatesEvaluated: 1,
        durationMs: Date.now() - start,
      };
    }
  }

  // -------------------------------------------------------------
  // 2. Learning engine (correções manuais anteriores)
  // -------------------------------------------------------------
  if (input.placeId) {
    const { data: learned } = await supabase
      .from("cnpj_discovery_learning")
      .select("cnpj")
      .eq("place_id", input.placeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (learned) {
      await logAttempt(supabase, { input, providerSlug: null, durationMs: Date.now() - start, cnpjsFound: 1, chosenCnpj: learned.cnpj, score: 100, reason: "correção manual anterior", source: "learning" });
      await upsertCache(supabase, input, learned.cnpj, 100);
      return {
        cnpj: learned.cnpj,
        score: 100,
        source: "learning",
        reason: "correção manual registrada anteriormente para este PlaceID",
        candidatesEvaluated: 1,
        durationMs: Date.now() - start,
      };
    }
  }

  // -------------------------------------------------------------
  // 3. Fallback entre providers, na ordem configurada
  // -------------------------------------------------------------
  // Avalia (valida + pontua) os candidatos de um provider. Usa o registro
  // que o provider ja trouxe (ex: CNPJa) e so revalida em outra API quando
  // nao veio (ex: Gemini, que retorna so o numero).
  const scored: ScoredCandidate[] = [];
  const seenCnpjs = new Set<string>();
  let providersTried = 0;
  let totalCandidates = 0;

  async function evaluateCandidates(candidates: CnpjCandidate[]) {
    for (const cand of candidates) {
      if (seenCnpjs.has(cand.cnpj)) continue;
      seenCnpjs.add(cand.cnpj);
      totalCandidates++;
      let record: CnpjRecord | null = cand.record ?? null;
      if (!record) {
        try {
          record = await deps.validateCnpj(cand.cnpj);
        } catch (_e) {
          record = null;
        }
      }
      if (!record) continue;
      scored.push(scoreCandidate(input, cand.cnpj, record, cand.sourceProvider));
    }
  }

  let best: ScoredCandidate | undefined;

  for (const provider of deps.providers) {
    providersTried++;
    const providerStart = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      if (!(await provider.isConfigured())) {
        await logAttempt(supabase, { input, providerSlug: provider.slug, durationMs: 0, cnpjsFound: 0, reason: "não configurado — pulado", source: "provider", error: null });
        continue;
      }

      const found = await provider.discover(input, controller.signal);
      await updateProviderStats(supabase, provider.slug, { durationMs: Date.now() - providerStart, success: true });
      await evaluateCandidates(found);

      // Melhor candidato que passou do corte ATE AGORA (considerando todos
      // os providers ja rodados).
      best = scored
        .filter((sc) => passesConfidenceThreshold(sc, minScore))
        .sort((a, b) => b.score - a.score)[0];

      const reason = found.length === 0
        ? "nenhum candidato"
        : (best ? "candidato aprovado (score suficiente)" : "candidatos abaixo do corte — continua fallback");
      await logAttempt(supabase, { input, providerSlug: provider.slug, durationMs: Date.now() - providerStart, cnpjsFound: found.length, reason, source: "provider" });

      // Só para quando ja tem um candidato confiavel. Se os achados nao
      // passaram no score, continua para o proximo provider (ex: Gemini),
      // que pode achar a empresa certa.
      if (best) break;
    } catch (err) {
      const providerErr = err instanceof ProviderError ? err : new ProviderError(provider.slug, "internal", String(err));
      await updateProviderStats(supabase, provider.slug, { durationMs: Date.now() - providerStart, success: false });
      await logAttempt(supabase, { input, providerSlug: provider.slug, durationMs: Date.now() - providerStart, cnpjsFound: 0, reason: "erro — fallback para próximo provider", source: "provider", error: `${providerErr.kind}: ${providerErr.message}` });
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!best) {
    if (totalCandidates === 0) {
      await logAttempt(supabase, { input, providerSlug: null, durationMs: Date.now() - start, cnpjsFound: 0, reason: `todos os ${providersTried} providers esgotados sem candidatos`, source: "none" });
      return {
        cnpj: null,
        score: null,
        source: "none",
        reason: "nenhum candidato encontrado em nenhum provider",
        candidatesEvaluated: 0,
        durationMs: Date.now() - start,
        userMessage: "Com esse nome e endereço não foi encontrado nenhum CNPJ. O nome pode estar registrado de forma diferente na Receita (ex: no nome do proprietário), ou a empresa não estar nas bases consultadas.",
        warningLevel: "warning",
      };
    }
    const bestSeen = [...scored].sort((a, b) => b.score - a.score)[0];
    await logAttempt(supabase, { input, providerSlug: null, durationMs: Date.now() - start, cnpjsFound: totalCandidates, reason: `nenhum candidato atingiu confiança mínima (${minScore})`, source: "none" });
    return {
      cnpj: null,
      score: bestSeen?.score ?? null,
      source: "none",
      reason: `${totalCandidates} candidato(s) avaliados, nenhum com confiança suficiente`,
      candidatesEvaluated: totalCandidates,
      durationMs: Date.now() - start,
      userMessage: `Foram encontrados ${totalCandidates} possível(is) CNPJ(s) com nome parecido, mas nenhum corresponde ao endereço informado (melhor confiança: ${bestSeen?.score ?? 0}%). Provavelmente é uma empresa homônima em outro endereço ou cidade.`,
      warningLevel: "warning",
    };
  }

  await upsertCache(supabase, input, best.cnpj, best.score);
  await logAttempt(supabase, {
    input,
    providerSlug: best.sourceProvider,
    durationMs: Date.now() - start,
    cnpjsFound: totalCandidates,
    chosenCnpj: best.cnpj,
    score: best.score,
    reason: `melhor score (campos: ${best.matchedFields.join(", ") || "nenhum"})`,
    source: "provider",
  });

  const camposBatidos = best.matchedFields.join(", ") || "nenhum campo";
  return {
    cnpj: best.cnpj,
    score: best.score,
    source: "provider",
    sourceProvider: best.sourceProvider,
    reason: `selecionado por score (${best.score}/100), campos batidos: ${best.matchedFields.join(", ") || "nenhum"}`,
    candidatesEvaluated: totalCandidates,
    durationMs: Date.now() - start,
    userMessage: best.score >= 80
      ? `CNPJ encontrado com alta confiança (${best.score}%). Bateram: ${camposBatidos}.`
      : `CNPJ encontrado, mas confira: confiança ${best.score}% (bateram apenas: ${camposBatidos}). Recomendado validar manualmente.`,
    warningLevel: best.score >= 80 ? "ok" : "info",
  };
}

// ---------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------

async function upsertCache(supabase: SupabaseClient, input: DiscoveryInput, cnpj: string, score: number) {
  const rows: Array<{ cache_type: string; cache_key: string }> = [];
  if (input.placeId) rows.push({ cache_type: "place_id", cache_key: input.placeId });
  if (input.phone) rows.push({ cache_type: "phone", cache_key: onlyDigits(input.phone) });
  if (input.website) rows.push({ cache_type: "website", cache_key: input.website.toLowerCase() });
  rows.push({ cache_type: "name_address", cache_key: `${canonicalName(input.businessName)}|${canonicalName(input.address)}` });

  for (const row of rows) {
    try {
      await supabase
        .from("cnpj_discovery_cache")
        .upsert(
          { ...row, cnpj, score, payload: input as unknown as Record<string, unknown> },
          { onConflict: "cache_type,cache_key" },
        );
    } catch (_e) {
      // Falha ao gravar cache nunca deve derrubar o fluxo principal.
    }
  }
}

async function updateProviderStats(
  supabase: SupabaseClient,
  slug: string,
  stats: { durationMs: number; success: boolean },
) {
  try {
    await supabase.rpc("bump_cnpj_discovery_provider_stats", {
      p_slug: slug,
      p_duration_ms: stats.durationMs,
      p_success: stats.success,
    });
  } catch (_e) {
    // RPC opcional (ver migration 002) — não falha o fluxo se ainda não existir.
  }
}

async function logAttempt(
  supabase: SupabaseClient,
  entry: {
    input: DiscoveryInput;
    providerSlug: string | null;
    durationMs: number;
    cnpjsFound: number;
    chosenCnpj?: string;
    score?: number | null;
    reason: string;
    source: string;
    error?: string | null;
  },
) {
  try {
    await supabase
      .from("cnpj_discovery_logs")
      .insert({
        provider_slug: entry.providerSlug,
        query: entry.input.businessName,
        duration_ms: entry.durationMs,
        cnpjs_found: entry.cnpjsFound,
        chosen_cnpj: entry.chosenCnpj ?? null,
        score: entry.score ?? null,
        reason: entry.reason,
        source: entry.source,
        error: entry.error ?? null,
      });
  } catch (_e) {
    // Log nunca deve derrubar o fluxo principal.
  }
}
