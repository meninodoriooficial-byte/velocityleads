import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      category, city, state, neighborhood, page, apiKeys, supabaseClient
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        resultsCount: searchResults.length,
        totalCount: totalCount || 0,
        hasMore: searchResults.length >= 10,
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
        error: error.message || 'Internal server error' 
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
  supabaseClient: any
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
      warning: 'Nenhuma chave de API ativa configurada. Configure no painel admin para receber resultados reais.',
    };
  }

  const failedLabels: string[] = [];

  for (let i = 0; i < apiKeys.length; i++) {
    const { key, label } = apiKeys[i];
    const isLast = i === apiKeys.length - 1;
    try {
      console.log(`Tentativa ${i + 1}/${apiKeys.length} usando "${label}" (${key.substring(0, 8)}...)`);
      const results = await callGooglePlaces(category, city, state, neighborhood, key);

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
    warning: `Todas as ${apiKeys.length} chave(s) de API falharam (${failedLabels.join(', ')}). Verifique a configuração no painel admin.`,
  };
}

async function callGooglePlaces(
  category: string,
  city: string,
  state: string,
  neighborhood: string | undefined,
  apiKey: string
): Promise<{ success: true; data: any[] } | { success: false; errorStatus: string; errorMessage: string; httpStatus?: number }> {
  const location = neighborhood ? `${neighborhood}, ${city}, ${state}` : `${city}, ${state}`;
  const query = `${category} ${location}`;
  const params = new URLSearchParams({
    query,
    key: apiKey,
    language: 'pt-BR',
    region: 'br',
  });
  const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`;

  const response = await fetch(placesUrl);
  if (!response.ok) {
    return {
      success: false,
      errorStatus: 'HTTP_ERROR',
      httpStatus: response.status,
      errorMessage: `Google Places retornou HTTP ${response.status}.`,
    };
  }

  const data = await response.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return {
      success: false,
      errorStatus: data.status || 'UNKNOWN',
      errorMessage: data.error_message || `Google Places retornou status ${data.status}`,
    };
  }

  const results = (data.results || []).slice(0, 10).map((place: any, index: number) =>
    processGooglePlaceResult(place, category, index + 1)
  );
  return { success: true, data: results };
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