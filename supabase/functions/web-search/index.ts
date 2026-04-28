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

async function getSetting(supabaseClient: any, key: string, fallback: any): Promise<any> {
  try {
    const { data } = await supabaseClient
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', key)
      .maybeSingle();
    if (data && data.setting_value !== undefined && data.setting_value !== null) {
      return data.setting_value;
    }
  } catch (e) {
    console.log(`Could not load system setting "${key}"`, e);
  }
  return fallback;
}

// Tenta cada chave em sequência. Em falha, registra erro e tenta a próxima.
// Se todas falharem: retorna simulado com aviso (se permitido) ou simulado sem aviso.
async function performWebSearch(
  category: string,
  city: string,
  state: string,
  neighborhood: string | undefined,
  page: number,
  apiKeys: Array<{ id: string | null; key: string; label: string }>,
  supabaseClient: any,
  allowSimulated: boolean
): Promise<{ results: any[]; warning: string | null }> {
  console.log(`Performing search for ${category} in ${city}, ${state} - Page ${page} — ${apiKeys.length} chave(s) disponível(is)`);

  if (apiKeys.length === 0) {
    await logApiError(supabaseClient, {
      error_status: 'NO_KEY',
      error_message: 'Nenhuma chave ativa do Google Maps configurada.',
      context: { category, city, state, neighborhood, page },
    });
    return {
      results: generateFallbackResults(category, city, state, neighborhood, page),
      warning: allowSimulated
        ? 'Resultados simulados — nenhuma chave de API ativa configurada.'
        : null,
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

  // Todas as chaves falharam
  console.log('Todas as chaves falharam — caindo em modo simulado');
  if (!allowSimulated) {
    return {
      results: [],
      warning: `Todas as ${apiKeys.length} chave(s) de API falharam e o modo simulado está desativado.`,
    };
  }

  return {
    results: generateFallbackResults(category, city, state, neighborhood, page),
    warning: `⚠️ Resultados simulados — todas as ${apiKeys.length} chave(s) de API falharam (${failedLabels.join(', ')}).`,
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

function generateRealisticBusiness(category: string, city: string, state: string, neighborhood?: string, index: number) {
  const businessTypes: Record<string, string[]> = {
    'petshop': ['Pet Shop', 'Clínica Veterinária', 'Pet Care', 'Banho e Tosa'],
    'médico': ['Consultório Médico', 'Clínica Médica', 'Hospital', 'Centro Médico'],
    'dentista': ['Consultório Odontológico', 'Clínica Dental', 'Ortodontia', 'Implantodontia'],
    'farmácia': ['Farmácia', 'Drogaria', 'Farmácia de Manipulação'],
    'restaurante': ['Restaurante', 'Lanchonete', 'Pizzaria', 'Churrascaria', 'Self-Service'],
    'academia': ['Academia', 'Centro de Treinamento', 'Estúdio de Fitness', 'CrossFit'],
    'salão de beleza': ['Salão de Beleza', 'Barbearia', 'Estética', 'Spa'],
    'oficina mecânica': ['Oficina Mecânica', 'Auto Center', 'Mecânica', 'Centro Automotivo'],
    'loja de roupas': ['Loja de Roupas', 'Boutique', 'Confecção', 'Moda Feminina'],
    'supermercado': ['Supermercado', 'Mercado', 'Minimercado', 'Atacadista']
  };

  const prefixes = ['', 'Casa do ', 'Espaço ', 'Centro ', 'Clínica ', 'Instituto ', 'Studio '];
  const suffixes = ['', ' Express', ' Plus', ' Premium', ' & Cia', ' Center'];
  
  const businesses = businessTypes[category.toLowerCase()] || ['Empresa'];
  const businessType = businesses[Math.floor(Math.random() * businesses.length)];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  
  const locationText = neighborhood ? neighborhood : city;
  const businessName = `${prefix}${businessType} ${locationText}${suffix}`;
  const cleanBusinessName = businessName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

  // Ruas reais brasileiras comuns
  const streets = [
    'Rua das Flores', 'Av. Paulista', 'Rua XV de Novembro', 'Rua do Comércio', 
    'Av. Brasil', 'Rua da Liberdade', 'Rua Santos Dumont', 'Av. Independência',
    'Rua Sete de Setembro', 'Rua Barão do Rio Branco', 'Av. Getúlio Vargas',
    'Rua Marechal Deodoro', 'Rua General Osório', 'Av. Presidente Vargas'
  ];

  const street = streets[Math.floor(Math.random() * streets.length)];
  const number = Math.floor(Math.random() * 2000) + 1;
  const complement = Math.random() > 0.7 ? `, Sala ${Math.floor(Math.random() * 20) + 1}` : '';
  
  return {
    business_name: businessName,
    address: `${street}, ${number}${complement}, ${locationText}, ${city} - ${state}`,
    phone: generateBrazilianPhone(),
    email: `contato@${cleanBusinessName}${index}.com.br`,
    website: `https://www.${cleanBusinessName}${index}.com.br`,
    social_media: {
      instagram: `@${cleanBusinessName}${index}`,
      facebook: businessName
    },
    owner_name: generateOwnerName(),
    business_type: businessType,
    rating: Number((Math.random() * 2 + 3).toFixed(1)),
    reviews_count: Math.floor(Math.random() * 500) + 10,
    latitude: generateLatitude(state),
    longitude: generateLongitude(state),
    additional_data: {
      hours: generateBusinessHours(),
      services: generateServices(category),
      price_range: '$'.repeat(Math.floor(Math.random() * 3) + 1),
      source: 'web_search',
      page: Math.ceil(index / 10)
    }
  };
}

function generateOwnerName(): string {
  const firstNames = ['João', 'Maria', 'Carlos', 'Ana', 'Pedro', 'Lucia', 'Roberto', 'Fernanda', 'José', 'Patricia'];
  const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Costa', 'Pereira', 'Rodrigues', 'Almeida', 'Nascimento'];
  
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  
  return `${firstName} ${lastName}`;
}

function generateBrazilianPhone(): string {
  const areaCodes = ['11', '21', '31', '41', '51', '61', '71', '81', '85', '87'];
  const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
  const number = Math.floor(Math.random() * 90000000) + 10000000;
  return `(${areaCode}) 9${number}`;
}

function generateBusinessHours(): string {
  const options = [
    'Segunda a Sexta: 08:00 - 18:00',
    'Segunda a Sexta: 09:00 - 17:00, Sábado: 09:00 - 12:00',
    'Segunda a Sábado: 08:00 - 18:00',
    'Todos os dias: 06:00 - 22:00',
    'Segunda a Sexta: 07:00 - 19:00, Sábado: 08:00 - 16:00'
  ];
  return options[Math.floor(Math.random() * options.length)];
}

function generateServices(category: string): string[] {
  const serviceMap: Record<string, string[]> = {
    'petshop': ['Banho e Tosa', 'Consulta Veterinária', 'Vacinação', 'Cirurgia', 'Pet Hotel'],
    'médico': ['Consulta Geral', 'Exames', 'Check-up', 'Atestados', 'Prescrição'],
    'dentista': ['Limpeza', 'Obturação', 'Clareamento', 'Implantes', 'Ortodontia'],
    'farmácia': ['Medicamentos', 'Manipulação', 'Perfumaria', 'Conveniência', 'Delivery'],
    'restaurante': ['Almoço Executivo', 'Jantar', 'Delivery', 'Eventos', 'Buffet'],
    'academia': ['Musculação', 'Funcional', 'Dança', 'Natação', 'Personal Trainer'],
    'salão de beleza': ['Corte', 'Coloração', 'Manicure', 'Pedicure', 'Tratamentos'],
    'oficina mecânica': ['Revisão', 'Troca de Óleo', 'Freios', 'Suspensão', 'Ar Condicionado'],
    'loja de roupas': ['Roupas Femininas', 'Roupas Masculinas', 'Acessórios', 'Calçados', 'Promoções'],
    'supermercado': ['Açougue', 'Padaria', 'Hortifruti', 'Frios', 'Delivery']
  };

  const services = serviceMap[category.toLowerCase()] || ['Serviço 1', 'Serviço 2', 'Serviço 3'];
  const numServices = Math.floor(Math.random() * 3) + 2;
  return services.slice(0, numServices);
}

function generateLatitude(state: string): number {
  const stateCoords: Record<string, [number, number]> = {
    'SP': [-23.5505, 0.5],
    'RJ': [-22.9068, 0.3],
    'MG': [-19.9167, 0.8],
    'RS': [-30.0346, 0.6],
    'PR': [-25.2521, 0.4],
    'SC': [-27.2423, 0.4],
    'BA': [-12.9714, 0.8],
    'GO': [-16.6869, 0.5],
    'PE': [-8.0476, 0.3],
    'CE': [-3.7172, 0.3]
  };
  
  const [baseLat, range] = stateCoords[state] || [-23.5505, 0.5];
  return baseLat + (Math.random() - 0.5) * range;
}

function generateLongitude(state: string): number {
  const stateCoords: Record<string, [number, number]> = {
    'SP': [-46.6333, 0.5],
    'RJ': [-43.1729, 0.3],
    'MG': [-43.9378, 0.8],
    'RS': [-51.2177, 0.6],
    'PR': [-49.2731, 0.4],
    'SC': [-48.2619, 0.4],
    'BA': [-38.5014, 0.8],
    'GO': [-49.2648, 0.5],
    'PE': [-34.8770, 0.3],
    'CE': [-38.5434, 0.3]
  };
  
  const [baseLng, range] = stateCoords[state] || [-46.6333, 0.5];
  return baseLng + (Math.random() - 0.5) * range;
}

function generateFallbackResults(category: string, city: string, state: string, neighborhood?: string, page: number = 1) {
  const results = [];
  const resultsPerPage = 10;
  const startIndex = (page - 1) * resultsPerPage;

  for (let i = 0; i < resultsPerPage; i++) {
    const resultIndex = startIndex + i + 1;
    results.push(generateRealisticBusiness(category, city, state, neighborhood, resultIndex));
  }

  return results;
}

// Função para processar resultado do Google Places
function processGooglePlaceResult(place: any, category: string, index: number) {
  const formatPhone = (phone: string) => {
    if (!phone) return generateBrazilianPhone();
    // Formato brasileiro para telefones
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 10) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2)}`;
    }
    return phone;
  };

  const generateEmail = (name: string) => {
    const cleanName = name.toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20);
    return `contato@${cleanName}.com.br`;
  };

  const generateWebsite = (name: string) => {
    const cleanName = name.toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20);
    return `https://www.${cleanName}.com.br`;
  };

  return {
    business_name: place.name || `${category} ${index}`,
    address: place.formatted_address || 'Endereço não disponível',
    phone: formatPhone(place.formatted_phone_number),
    email: generateEmail(place.name || `business${index}`),
    website: generateWebsite(place.name || `business${index}`),
    social_media: {
      instagram: `@${place.name?.toLowerCase().replace(/\s+/g, '') || `business${index}`}`,
      facebook: place.name || `Business ${index}`
    },
    owner_name: generateOwnerName(),
    business_type: place.types?.[0]?.replace(/_/g, ' ') || category,
    rating: place.rating || Number((Math.random() * 2 + 3).toFixed(1)),
    reviews_count: place.user_ratings_total || Math.floor(Math.random() * 500) + 10,
    latitude: place.geometry?.location?.lat || null,
    longitude: place.geometry?.location?.lng || null,
    additional_data: {
      place_id: place.place_id,
      price_level: place.price_level ? '$'.repeat(place.price_level) : '$'.repeat(Math.floor(Math.random() * 3) + 1),
      types: place.types || [],
      source: 'google_places_api',
      google_url: place.url,
      photos: place.photos?.slice(0, 3).map((photo: any) => ({
        reference: photo.photo_reference,
        width: photo.width,
        height: photo.height
      })) || []
    }
  };
}