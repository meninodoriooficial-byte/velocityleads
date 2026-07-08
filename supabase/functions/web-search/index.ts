import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAINTENANCE_MESSAGE =
  'O sistema está passando por uma atualização. Por favor, tente novamente mais tarde.';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { searchId, category, state, city, neighborhood, page = 1 } = await req.json();

    console.log('Starting web search for:', { category, state, city, neighborhood, page });

    // Buscar dados da busca (para descobrir o user) e o plano do usuário
    const { data: searchRow } = await supabaseClient
      .from('searches')
      .select('user_id')
      .eq('id', searchId)
      .maybeSingle();

    let planLimit = 100;
    if (searchRow?.user_id) {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('plan_searches_limit')
        .eq('user_id', searchRow.user_id)
        .maybeSingle();
      if (profile?.plan_searches_limit && profile.plan_searches_limit > 0) {
        planLimit = profile.plan_searches_limit;
      }
    }

    // Place_ids já capturados nesta busca — para não duplicar entre lotes
    const { data: existingRows } = await supabaseClient
      .from('search_results')
      .select('additional_data')
      .eq('search_id', searchId);

    const existingPlaceIds = new Set<string>();
    for (const row of existingRows || []) {
      const pid = (row as any)?.additional_data?.place_id;
      if (pid) existingPlaceIds.add(pid);
    }

    const alreadyCaptured = existingPlaceIds.size;
    const remainingByPlan = Math.max(0, planLimit - alreadyCaptured);
    const BATCH = 100;
    const targetThisBatch = Math.min(BATCH, remainingByPlan);

    if (targetThisBatch === 0) {
      await supabaseClient
        .from('searches')
        .update({ status: 'completed', results_count: alreadyCaptured })
        .eq('id', searchId);
      return new Response(
        JSON.stringify({
          success: true,
          resultsCount: 0,
          totalCount: alreadyCaptured,
          hasMore: false,
          planLimit,
          planReached: true,
          warning: `Limite do plano atingido (${planLimit} capturas).`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Atualizar status da busca
    await supabaseClient
      .from('searches')
      .update({ status: 'processing' })
      .eq('id', searchId);

    // Carregar chaves ativas do provider google_places em ordem de prioridade,
    // com fallback para env (GOOGLE_MAPS_API_KEY).
    const apiKeys = await loadProviderKeys(supabaseClient, 'google_places', 'GOOGLE_MAPS_API_KEY');

    // Executar busca tentando cada chave em sequência (sem fallback simulado)
    const { results: searchResults, warning } = await performWebSearch(
      category, city, state, neighborhood, page, apiKeys, supabaseClient,
      existingPlaceIds, targetThisBatch
    );
    
    // Salvar resultados no banco
    const { error: insertError } = await supabaseClient
      .from('search_results')
      .insert(
        searchResults.map(result => ({
          search_id: searchId,
          ...result
        }))
      );

    if (insertError) {
      console.error('Error inserting results:', insertError);
      throw insertError;
    }

    // Buscar contagem total atual
    const { count: totalCount } = await supabaseClient
      .from('search_results')
      .select('*', { count: 'exact', head: true })
      .eq('search_id', searchId);

    // Atualizar status e contagem
    await supabaseClient
      .from('searches')
      .update({ 
        status: 'completed',
        results_count: totalCount || 0,
        warning: warning ?? null,
      })
      .eq('id', searchId);

    console.log(`Search completed: ${searchResults.length} new results found, ${totalCount} total${warning ? ` (warning: ${warning})` : ''}`);

    const total = totalCount || 0;
    // hasMore = ainda cabe mais no plano. Mesmo que este lote tenha vindo
    // parcial (Google exauriu a rotação atual de queries), permitimos ao
    // frontend chamar novamente com page+1 para rotacionar queries e
    // completar o alvo de 100 novos leads.
    const hasMore = total < planLimit;

    return new Response(
      JSON.stringify({
        success: true,
        resultsCount: searchResults.length,
        totalCount: total,
        hasMore,
        planLimit,
        planReached: total >= planLimit,
        warning: warning ?? null,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in web-search function:', error);
    
    return new Response(
      JSON.stringify({
        error: MAINTENANCE_MESSAGE,
        detail: error?.message || 'Internal server error',
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

// Carrega chaves ativas de um provider em ordem de prioridade.
// Sempre acrescenta a chave do env como último fallback se houver.
async function loadProviderKeys(supabaseClient: any, provider: string, envName: string): Promise<Array<{ id: string | null; key: string; label: string }>> {
  const keys: Array<{ id: string | null; key: string; label: string }> = [];
  try {
    // Usa RPC SECURITY DEFINER que descriptografa as chaves no banco.
    // Apenas service_role pode chamar.
    const { data, error } = await supabaseClient.rpc('get_provider_keys_decrypted', {
      _provider: provider,
    });
    if (error) {
      console.error('Erro ao carregar chaves do provider:', error);
    }
    if (Array.isArray(data)) {
      for (const row of data) {
        if (row.api_key && typeof row.api_key === 'string' && row.api_key.trim()) {
          keys.push({ id: row.id, key: row.api_key.trim(), label: row.key_name });
        }
      }
    }
  } catch (e) {
    console.log('Could not load provider keys', e);
  }
  const envKey = Deno.env.get(envName) || '';
  if (envKey && !keys.some((k) => k.key === envKey)) {
    keys.push({ id: null, key: envKey, label: `env:${envName}` });
  }
  return keys;
}

// Tenta cada chave em sequência. Em falha, registra erro e tenta a próxima.
// Se todas falharem: retorna lista vazia com aviso (sem dados simulados).
async function performWebSearch(
  category: string,
  city: string,
  state: string,
  neighborhood: string | undefined,
  page: number,
  apiKeys: Array<{ id: string | null; key: string; label: string }>,
  supabaseClient: any,
  excludePlaceIds: Set<string> = new Set(),
  target: number = 100
): Promise<{ results: any[]; warning: string | null }> {
  console.log(`Performing search for ${category} in ${city}, ${state} - Page ${page} — ${apiKeys.length} chave(s) disponível(is)`);

  if (apiKeys.length === 0) {
    await logApiError(supabaseClient, {
      error_status: 'NO_KEY',
      error_message: 'Nenhuma chave ativa do Google Maps configurada.',
      context: { category, city, state, neighborhood, page },
    });
    return {
      results: [],
      warning: MAINTENANCE_MESSAGE,
    };
  }

  const failedLabels: string[] = [];

  for (let i = 0; i < apiKeys.length; i++) {
    const { key, label } = apiKeys[i];
    const isLast = i === apiKeys.length - 1;
    try {
      console.log(`Tentativa ${i + 1}/${apiKeys.length} usando "${label}" (${key.substring(0, 8)}...)`);
      const results = await callGooglePlaces(category, city, state, neighborhood, key, page, excludePlaceIds, target);

      if (results.success) {
        const warning =
          i > 0
            ? `A chave principal falhou (${failedLabels.join(', ')}). Resultados obtidos via chave alternativa.`
            : null;
        return { results: results.data, warning };
      }

      // Falhou — registra e tenta próxima
      failedLabels.push(label);
      await logApiError(supabaseClient, {
        error_status: results.errorStatus,
        http_status: results.httpStatus,
        error_message: `[${label}] ${results.errorMessage}`,
        context: { category, city, state, neighborhood, page, attempt: i + 1, total_keys: apiKeys.length },
      });

      if (!isLast) {
        console.log(`Falhou com "${label}" (${results.errorStatus}). Tentando próxima chave...`);
      }
    } catch (error: any) {
      failedLabels.push(label);
      await logApiError(supabaseClient, {
        error_status: 'EXCEPTION',
        error_message: `[${label}] ${error?.message || String(error)}`,
        context: { category, city, state, neighborhood, page, attempt: i + 1 },
      });
    }
  }

  // Todas as chaves falharam — sem fallback simulado
  console.log('Todas as chaves falharam — retornando vazio');
  return {
    results: [],
    warning: MAINTENANCE_MESSAGE,
  };
}

async function callGooglePlaces(
  category: string,
  city: string,
  state: string,
  neighborhood: string | undefined,
  apiKey: string,
  page: number = 1,
  excludePlaceIds: Set<string> = new Set(),
  target: number = 100
): Promise<{ success: true; data: any[] } | { success: false; errorStatus: string; errorMessage: string; httpStatus?: number }> {
  const TARGET = target;

  // Monta variações de query (Google limita ~60 por query). Cada lote (page) usa um conjunto diferente.
  const baseQueries: string[] = [];
  if (neighborhood) {
    // Quando o bairro é informado, restringimos TODAS as queries ao bairro.
    baseQueries.push(`${category} ${neighborhood}, ${city}, ${state}`);
    baseQueries.push(`${category} no bairro ${neighborhood}, ${city}`);
    baseQueries.push(`${category} ${neighborhood} ${city} ${state}`);
    baseQueries.push(`melhores ${category} ${neighborhood} ${city}`);
    baseQueries.push(`empresas de ${category} ${neighborhood} ${city}`);
    baseQueries.push(`lojas de ${category} ${neighborhood} ${city}`);
    baseQueries.push(`serviços de ${category} ${neighborhood} ${city}`);
    baseQueries.push(`${category} perto de ${neighborhood} ${city}`);
    baseQueries.push(`${category} avenida ${neighborhood} ${city}`);
    baseQueries.push(`${category} rua ${neighborhood} ${city}`);
    baseQueries.push(`onde encontrar ${category} ${neighborhood} ${city}`);
    baseQueries.push(`${category} pequenas empresas ${neighborhood} ${city}`);
  } else {
    baseQueries.push(`${category} ${city}, ${state}`);
    baseQueries.push(`${category} em ${city} ${state}`);
    baseQueries.push(`${category} próximo a ${city} ${state}`);
    baseQueries.push(`melhores ${category} ${city} ${state}`);
    baseQueries.push(`${category} centro ${city}`);
    baseQueries.push(`${category} região ${city} ${state}`);
    baseQueries.push(`empresas de ${category} ${city} ${state}`);
    baseQueries.push(`lojas de ${category} ${city} ${state}`);
    baseQueries.push(`serviços de ${category} ${city} ${state}`);
    baseQueries.push(`${category} zona norte ${city}`);
    baseQueries.push(`${category} zona sul ${city}`);
    baseQueries.push(`${category} zona leste ${city}`);
    baseQueries.push(`${category} zona oeste ${city}`);
    baseQueries.push(`${category} bairros ${city} ${state}`);
    baseQueries.push(`onde encontrar ${category} ${city}`);
    baseQueries.push(`${category} pequenas empresas ${city} ${state}`);
    baseQueries.push(`${category} novos ${city} ${state}`);
    baseQueries.push(`${category} tradicional ${city} ${state}`);
  }

  // Helper para normalizar (sem acentos, minúsculo) — usado no filtro por bairro
  const norm = (s: string) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const neighborhoodNorm = neighborhood ? norm(neighborhood) : "";
  // Rotaciona o conjunto de queries conforme o lote para diversificar resultados
  const offset = Math.max(0, (page - 1)) % baseQueries.length;
  const queries = [...baseQueries.slice(offset), ...baseQueries.slice(0, offset)];

  const collected: any[] = [];
  const seenPlaceIds = new Set<string>(excludePlaceIds);
  let firstError: { errorStatus: string; errorMessage: string; httpStatus?: number } | null = null;
  let anySuccess = false;

  for (const query of queries) {
    if (collected.length >= TARGET) break;

    let pageToken: string | undefined = undefined;
    let pagesFetched = 0;

    // Cada query suporta até 3 páginas (60 resultados) via next_page_token
    while (pagesFetched < 3 && collected.length < TARGET) {
      const params = new URLSearchParams({
        key: apiKey,
        language: 'pt-BR',
        region: 'br',
      });
      if (pageToken) {
        params.set('pagetoken', pageToken);
      } else {
        params.set('query', query);
      }
      const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`;

      const response = await fetch(placesUrl);
      if (!response.ok) {
        if (!anySuccess && !firstError) {
          firstError = {
            errorStatus: 'HTTP_ERROR',
            httpStatus: response.status,
            errorMessage: `Google Places retornou HTTP ${response.status}.`,
          };
        }
        break;
      }

      const data = await response.json();
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        if (!anySuccess && !firstError) {
          firstError = {
            errorStatus: data.status || 'UNKNOWN',
            errorMessage: data.error_message || `Google Places retornou status ${data.status}`,
          };
        }
        break;
      }

      anySuccess = true;

      for (const place of data.results || []) {
        if (collected.length >= TARGET) break;
        const pid = place.place_id;
        if (pid && seenPlaceIds.has(pid)) continue;
        // Filtro de bairro suavizado: aceita se endereço contiver bairro,
        // ou se a query original mencionar o bairro (Google já ranqueou por proximidade).
        // Isso evita descartar leads legítimos quando o Google omite o bairro no formatted_address.
        if (pid) seenPlaceIds.add(pid);
        collected.push(processGooglePlaceResult(place, category, collected.length + 1));
      }

      pagesFetched++;
      pageToken = data.next_page_token;
      if (!pageToken) break;

      // O token só fica válido após ~2s (mínimo necessário)
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!anySuccess && firstError) {
    return { success: false, ...firstError };
  }

  const results = collected;

  // Enriquecer com concorrência limitada para não estourar o timeout da edge function.
  // Sem limite, 100 fetches simultâneos causavam timeout e nenhum lead era salvo.
  const CONCURRENCY = 6;
  const enriched = new Array(results.length);
  let cursor = 0;
  async function worker() {
    while (cursor < results.length) {
      const idx = cursor++;
      const r = results[idx];
      try {
        const placeId = r.additional_data?.place_id;
        if (placeId) {
          const details = await fetchPlaceDetails(placeId, apiKey);
          if (details) {
            r.phone = details.phone || r.phone;
            r.website = details.website || r.website;
            if (details.url) r.additional_data.google_url = details.url;
            if (details.opening_hours) r.additional_data.hours = details.opening_hours;
          }
        }
        if (r.website) {
          const scraped = await scrapeWebsite(r.website);
          if (scraped.email) r.email = scraped.email;
          if (scraped.instagram) r.social_media.instagram = scraped.instagram;
          if (scraped.facebook) r.social_media.facebook = scraped.facebook;
          if (scraped.phone && !r.phone) r.phone = scraped.phone;
        }
      } catch (e) {
        console.log("enrichment error for", r.business_name, (e as any)?.message);
      }
      enriched[idx] = r;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return { success: true, data: enriched };
}

async function fetchPlaceDetails(placeId: string, apiKey: string) {
  try {
    const params = new URLSearchParams({
      place_id: placeId,
      key: apiKey,
      language: "pt-BR",
      fields:
        "formatted_phone_number,international_phone_number,website,url,opening_hours,address_components",
    });
    const url = `https://maps.googleapis.com/maps/api/place/details/json?${params}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.status !== "OK") {
      console.log("Place details status", placeId, data.status);
      return null;
    }
    const r = data.result || {};
    const formatPhone = (phone?: string) => {
      if (!phone) return null;
      const cleaned = phone.replace(/\D/g, "");
      if (cleaned.length >= 10) {
        return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2)}`;
      }
      return phone;
    };
    return {
      phone: formatPhone(r.formatted_phone_number || r.international_phone_number),
      website: r.website || null,
      url: r.url || null,
      opening_hours: r.opening_hours?.weekday_text || null,
    };
  } catch (e) {
    console.log("fetchPlaceDetails error", e);
    return null;
  }
}

async function scrapeWebsite(rawUrl: string) {
  const result: { email?: string; phone?: string; instagram?: string; facebook?: string } = {};
  try {
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LeadFinderBot/1.0; +https://lovable.dev)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) return result;
    const ctype = resp.headers.get("content-type") || "";
    if (!ctype.includes("text/html") && !ctype.includes("text/plain")) return result;

    const html = (await resp.text()).slice(0, 500_000);

    // Email
    const emailMatch = html.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    );
    if (emailMatch) {
      const e = emailMatch[0];
      // Filtrar lixos comuns (sentry, wixpress, exemplo)
      if (!/(sentry|wixpress|example|@2x|\.png|\.jpg|\.svg)/i.test(e)) {
        result.email = e;
      }
    }

    // Phone (BR)
    const phoneMatch = html.match(
      /(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/
    );
    if (phoneMatch) {
      const cleaned = phoneMatch[0].replace(/\D/g, "").replace(/^55/, "");
      if (cleaned.length >= 10 && cleaned.length <= 11) {
        result.phone = `(${cleaned.substring(0, 2)}) ${cleaned.substring(2)}`;
      }
    }

    // Instagram
    const ig = html.match(
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})/i
    );
    if (ig && !/\/(p|reel|explore|accounts|tv)\b/i.test(ig[0])) {
      result.instagram = `@${ig[1]}`;
    }

    // Facebook
    const fb = html.match(
      /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9.\-_]{2,})/i
    );
    if (fb && !/\/(sharer|plugins|tr|dialog|login)\b/i.test(fb[0])) {
      result.facebook = fb[1];
    }
  } catch (e) {
    console.log("scrapeWebsite error", rawUrl, (e as any)?.message);
  }
  return result;
}

async function logApiError(supabaseClient: any, payload: {
  error_status: string;
  error_message: string;
  http_status?: number;
  context?: Record<string, unknown>;
}) {
  try {
    await supabaseClient.from('api_error_logs').insert({
      key_name: 'GOOGLE_MAPS_API_KEY',
      source: 'web-search',
      error_status: payload.error_status,
      error_message: payload.error_message,
      http_status: payload.http_status ?? null,
      context: payload.context ?? {},
    });
  } catch (e) {
    console.error('Failed to log api error', e);
  }
}

// Função para processar resultado do Google Places — somente dados reais
function processGooglePlaceResult(place: any, category: string, _index: number) {
  const formatPhone = (phone?: string) => {
    if (!phone) return null;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 10) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2)}`;
    }
    return phone;
  };

  return {
    business_name: place.name || 'Sem nome',
    address: place.formatted_address || place.vicinity || null,
    phone: formatPhone(place.formatted_phone_number) || null,
    email: null,
    website: place.website || null,
    social_media: {},
    owner_name: null,
    business_type: place.types?.[0]?.replace(/_/g, ' ') || category,
    rating: place.rating ?? null,
    reviews_count: place.user_ratings_total ?? null,
    latitude: place.geometry?.location?.lat ?? null,
    longitude: place.geometry?.location?.lng ?? null,
    source_api: 'google_places',
    additional_data: {
      place_id: place.place_id,
      price_level: place.price_level ? '$'.repeat(place.price_level) : null,
      types: place.types || [],
      source: 'google_places_api',
      google_url: place.url || (place.place_id ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}` : null),
      photos: place.photos?.slice(0, 3).map((photo: any) => ({
        reference: photo.photo_reference,
        width: photo.width,
        height: photo.height
      })) || []
    }
  };
}