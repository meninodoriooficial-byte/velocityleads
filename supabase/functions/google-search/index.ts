import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { searchId, category, state, city } = await req.json();
    
    console.log('Starting search for:', { category, state, city });

    // Atualizar status da busca
    await supabaseClient
      .from('searches')
      .update({ status: 'processing' })
      .eq('id', searchId);

    const searchQuery = `${category} ${city} ${state}`;
    
    // Simular busca (substituir por integração real do Google Maps)
    const mockResults = await simulateGoogleMapsSearch(searchQuery, category, city, state);
    
    // Salvar resultados no banco
    const { error: insertError } = await supabaseClient
      .from('search_results')
      .insert(
        mockResults.map(result => ({
          search_id: searchId,
          ...result
        }))
      );

    if (insertError) {
      console.error('Error inserting results:', insertError);
      throw insertError;
    }

    // Atualizar status e contagem
    await supabaseClient
      .from('searches')
      .update({ 
        status: 'completed',
        results_count: mockResults.length
      })
      .eq('id', searchId);

    console.log(`Search completed: ${mockResults.length} results found`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        resultsCount: mockResults.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in google-search function:', error);
    
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

// Função para simular busca no Google Maps (substituir por integração real)
async function simulateGoogleMapsSearch(query: string, category: string, city: string, state: string) {
  // Simular delay da API
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const businessTypes = {
    'petshop': ['Pet Shop', 'Clínica Veterinária', 'Pet Care'],
    'médico': ['Consultório Médico', 'Clínica Médica', 'Hospital'],
    'dentista': ['Consultório Odontológico', 'Clínica Dental', 'Ortodontia']
  };

  const businesses = businessTypes[category.toLowerCase()] || ['Empresa'];
  const results = [];

  for (let i = 0; i < Math.floor(Math.random() * 10) + 5; i++) {
    const businessType = businesses[Math.floor(Math.random() * businesses.length)];
    results.push({
      business_name: `${businessType} ${city} ${i + 1}`,
      address: `Rua ${Math.floor(Math.random() * 1000)}, ${city}, ${state}`,
      phone: `(11) 9${Math.floor(Math.random() * 90000000) + 10000000}`,
      email: `contato@${businessType.toLowerCase().replace(/\s+/g, '')}${i + 1}.com.br`,
      website: `https://www.${businessType.toLowerCase().replace(/\s+/g, '')}${i + 1}.com.br`,
      social_media: {
        instagram: `@${businessType.toLowerCase().replace(/\s+/g, '')}${i + 1}`,
        facebook: `${businessType} ${city} ${i + 1}`
      },
      owner_name: `Proprietário ${i + 1}`,
      business_type: businessType,
      rating: Number((Math.random() * 2 + 3).toFixed(1)), // 3.0 - 5.0
      reviews_count: Math.floor(Math.random() * 200) + 10,
      latitude: -23.5505 + (Math.random() - 0.5) * 0.1,
      longitude: -46.6333 + (Math.random() - 0.5) * 0.1,
      additional_data: {
        hours: '08:00 - 18:00',
        services: [`Serviço 1`, `Serviço 2`, `Serviço 3`],
        price_range: '$'.repeat(Math.floor(Math.random() * 3) + 1)
      }
    });
  }

  return results;
}