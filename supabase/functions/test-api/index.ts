import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ ok: false, error: 'Não autenticado' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verificar usuário e papel admin
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return jsonResponse({ ok: false, error: 'Sessão inválida' }, 401);
    }

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) {
      return jsonResponse({ ok: false, error: 'Acesso restrito a administradores' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const keyName: string = body.key_name || 'GOOGLE_MAPS_API_KEY';

    // Buscar chave da tabela api_configs (prioridade) e fallback para env
    let apiKey = '';
    let isActive = true;
    const { data: cfg } = await supabase
      .from('api_configs')
      .select('api_key, is_active')
      .eq('key_name', keyName)
      .maybeSingle();
    if (cfg) {
      apiKey = cfg.api_key || '';
      isActive = !!cfg.is_active;
    }
    if (!apiKey) apiKey = Deno.env.get(keyName) || '';

    if (!apiKey) {
      return jsonResponse({ ok: false, status: 'no_key', message: 'Nenhuma chave configurada para esta API.' });
    }
    if (!isActive) {
      return jsonResponse({ ok: false, status: 'inactive', message: 'A chave existe, mas está marcada como inativa.' });
    }

    if (keyName === 'GOOGLE_MAPS_API_KEY') {
      const result = await testGooglePlaces(apiKey);
      return jsonResponse(result);
    }

    return jsonResponse({
      ok: false,
      status: 'unsupported',
      message: `Teste automático ainda não disponível para ${keyName}. A chave está armazenada.`,
    });
  } catch (e: any) {
    console.error('test-api error', e);
    return jsonResponse({ ok: false, status: 'error', message: e.message || 'Erro interno' }, 500);
  }
});

async function testGooglePlaces(apiKey: string) {
  const start = Date.now();
  try {
    const params = new URLSearchParams({
      query: 'restaurante São Paulo',
      key: apiKey,
      language: 'pt-BR',
      region: 'br',
    });
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`;
    const res = await fetch(url);
    const elapsed = Date.now() - start;
    if (!res.ok) {
      return { ok: false, status: 'http_error', http: res.status, message: `HTTP ${res.status} ao chamar Google Places.`, elapsed_ms: elapsed };
    }
    const data = await res.json();
    const status = data.status as string;
    const baseInfo = { elapsed_ms: elapsed, results_count: data.results?.length ?? 0, google_status: status };

    if (status === 'OK' || status === 'ZERO_RESULTS') {
      return {
        ok: true,
        status: 'success',
        message: status === 'OK'
          ? `Conexão OK — Google Places retornou ${data.results.length} resultados em ${elapsed}ms.`
          : `Conexão OK — chave válida, mas a busca-teste retornou 0 resultados.`,
        ...baseInfo,
      };
    }

    const errorMessages: Record<string, string> = {
      REQUEST_DENIED: 'A chave foi recusada. Verifique se a Places API está habilitada, billing ativo e restrições corretas.',
      INVALID_REQUEST: 'Requisição inválida — verifique parâmetros da chave.',
      OVER_QUERY_LIMIT: 'Cota excedida ou billing não habilitado.',
      UNKNOWN_ERROR: 'Erro temporário do Google. Tente novamente em instantes.',
    };

    return {
      ok: false,
      status: 'api_error',
      message: errorMessages[status] || `Google retornou status: ${status}`,
      google_error: data.error_message,
      ...baseInfo,
    };
  } catch (e: any) {
    return { ok: false, status: 'network_error', message: `Erro de rede: ${e.message}` };
  }
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}