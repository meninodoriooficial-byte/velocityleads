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

    // Cliente com contexto do usuário (para validar a sessão via JWT)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error('getClaims error', claimsErr);
      return jsonResponse({ ok: false, error: 'Sessão inválida' }, 401);
    }
    const userId = claimsData.claims.sub as string;

    // Cliente service-role para acessar tabelas com bypass de RLS e RPC
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) {
      return jsonResponse({ ok: false, error: 'Acesso restrito a administradores' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const keyName: string = body.key_name || 'GOOGLE_MAPS_API_KEY';

    // Verificar status da configuração e descriptografar via RPC
    let apiKey = '';
    let isActive = true;
    const { data: cfg } = await supabase
      .from('api_configs')
      .select('is_active, api_key_last4')
      .eq('key_name', keyName)
      .maybeSingle();
    if (cfg) {
      isActive = !!cfg.is_active;
      // Descriptografa mesmo se inativa: o admin precisa poder testar a chave
      // ANTES de ativar. A ativação é uma etapa separada.
      if (cfg.api_key_last4) {
        const { data: decrypted, error: rpcErr } = await supabase.rpc('get_api_key_decrypted', {
          _key_name: keyName,
        });
        if (rpcErr) {
          console.error('Erro ao descriptografar chave', rpcErr);
        }
        if (typeof decrypted === 'string') apiKey = decrypted;
      }
    }
    if (!apiKey) apiKey = Deno.env.get(keyName) || '';

    if (!apiKey) {
      return jsonResponse({ ok: false, status: 'no_key', message: 'Nenhuma chave configurada para esta API.' });
    }

    if (keyName === 'GOOGLE_MAPS_API_KEY') {
      const result = await testGooglePlaces(apiKey);
      if (!result.ok) {
        try {
          await supabase.from('api_error_logs').insert({
            key_name: keyName,
            source: 'test-api',
            error_status: (result as any).google_status || (result as any).status || 'ERROR',
            error_message: result.message,
            http_status: (result as any).http ?? null,
            context: { triggered_by: 'admin_test', user_id: userId },
          });
        } catch (e) {
          console.error('Failed to persist test error', e);
        }
      }
      await persistTestResult(supabase, keyName, result.ok);
      return jsonResponse(result);
    }

    if (keyName === 'CASADOSDADOS_API_KEY') {
      const result = await testCasaDosDados(apiKey);
      if (!result.ok) {
        try {
          await supabase.from('api_error_logs').insert({
            key_name: keyName,
            source: 'test-api',
            error_status: (result as any).status || 'ERROR',
            error_message: result.message,
            http_status: (result as any).http ?? null,
            context: { triggered_by: 'admin_test', user_id: userId },
          });
        } catch (e) {
          console.error('Failed to persist test error', e);
        }
      }
      await persistTestResult(supabase, keyName, result.ok);
      return jsonResponse(result);
    }

    if (keyName === 'OPENAI_API_KEY') {
      const result = await testOpenAI(apiKey);
      if (!result.ok) {
        try {
          await supabase.from('api_error_logs').insert({
            key_name: keyName,
            source: 'test-api',
            error_status: (result as any).status || 'ERROR',
            error_message: result.message,
            http_status: (result as any).http ?? null,
            context: { triggered_by: 'admin_test', user_id: userId },
          });
        } catch (e) {
          console.error('Failed to persist test error', e);
        }
      }
      await persistTestResult(supabase, keyName, result.ok);
      return jsonResponse(result);
    }

    if (keyName === 'CNPJA_TOKEN') {
      const r = await testCnpja(apiKey);
      await persistTestResult(supabase, keyName, r.ok);
      return jsonResponse(r);
    }
    if (keyName === 'RECEITAWS_TOKEN') {
      const r = await testReceitaWs(apiKey);
      await persistTestResult(supabase, keyName, r.ok);
      return jsonResponse(r);
    }
    if (keyName === 'ECONODATA_TOKEN') {
      const r = await testEconodata(apiKey);
      await persistTestResult(supabase, keyName, r.ok);
      return jsonResponse(r);
    }
    if (keyName === 'BRASILAPI_ENABLED') {
      const r = await testBrasilApi();
      await persistTestResult(supabase, keyName, r.ok);
      return jsonResponse(r);
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

async function persistTestResult(supabase: any, keyName: string, ok: boolean) {
  try {
    await supabase
      .from('api_configs')
      .update({ last_test_ok: ok, last_tested_at: new Date().toISOString() })
      .eq('key_name', keyName);
  } catch (e) {
    console.error('Failed to persist last_test_ok', e);
  }
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

async function testOpenAI(apiKey: string) {
  const start = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    const elapsed = Date.now() - start;
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const count = Array.isArray((data as any).data) ? (data as any).data.length : 0;
      return {
        ok: true,
        status: 'success',
        message: `Conexão OK — chave OpenAI válida (${count} modelos disponíveis em ${elapsed}ms).`,
        elapsed_ms: elapsed,
        models_count: count,
      };
    }

    const apiMsg = (data as any)?.error?.message || `HTTP ${res.status}`;
    const code = (data as any)?.error?.code || (data as any)?.error?.type;
    const messages: Record<number, string> = {
      401: 'Chave inválida ou revogada. Gere uma nova em platform.openai.com/api-keys.',
      403: 'Chave sem permissão para acessar este recurso (verifique escopo/projeto).',
      429: 'Cota excedida ou rate limit atingido. Verifique billing em platform.openai.com.',
      500: 'Erro temporário do servidor OpenAI. Tente novamente em instantes.',
    };
    return {
      ok: false,
      status: 'api_error',
      http: res.status,
      message: messages[res.status] || `OpenAI retornou: ${apiMsg}`,
      openai_error: apiMsg,
      openai_code: code,
      elapsed_ms: elapsed,
    };
  } catch (e: any) {
    return { ok: false, status: 'network_error', message: `Erro de rede: ${e.message}` };
  }
}

async function testCasaDosDados(apiKey: string) {
  const start = Date.now();
  // Verifica apenas a disponibilidade do site público casadosdados.com.br.
  // Não existe API REST pública oficial — o acesso é feito por scraping da página
  // protegida por Cloudflare, então a "chave" salva é apenas opcional para planos pagos.
  try {
    const url = 'https://casadosdados.com.br/';
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeadFinderBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    const elapsed = Date.now() - start;
    await res.text(); // consume body

    if (res.status === 403 || res.status === 503) {
      return {
        ok: false,
        status: 'cloudflare_block',
        http: res.status,
        message:
          `casadosdados.com.br retornou HTTP ${res.status} (proteção Cloudflare). ` +
          `Não existe API REST pública oficial — a integração depende de scraping do site, ` +
          `que pode estar temporariamente bloqueado. A chave salva é apenas referência e não é validada online.`,
        elapsed_ms: elapsed,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: 'http_error',
        http: res.status,
        message: `HTTP ${res.status} ao acessar casadosdados.com.br. Site pode estar fora do ar.`,
        elapsed_ms: elapsed,
      };
    }

    return {
      ok: true,
      status: 'success',
      message:
        `Site casadosdados.com.br acessível (${elapsed}ms). ` +
        `Observação: não há API REST pública — a chave salva (${apiKey ? 'presente' : 'ausente'}) ` +
        `é apenas usada se você tiver plano pago. O modo padrão usa scraping público.`,
      elapsed_ms: elapsed,
      key_configured: !!apiKey,
    };
  } catch (e: any) {
    return { ok: false, status: 'network_error', message: `Erro de rede: ${e.message}` };
  }
}
// ---- Testes das APIs de enriquecimento ----
const TEST_CNPJ = "00000000000191"; // Banco do Brasil (CNPJ público conhecido)

async function testCnpja(apiKey: string) {
  const start = Date.now();
  try {
    const res = await fetch(`https://api.cnpja.com/office/${TEST_CNPJ}`, {
      headers: { Authorization: apiKey },
    });
    const elapsed = Date.now() - start;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 'auth_error', http: res.status, message: 'Token inválido ou sem permissão na CNPJá.', elapsed_ms: elapsed };
    }
    if (!res.ok) {
      return { ok: false, status: 'http_error', http: res.status, message: `HTTP ${res.status} ao chamar CNPJá.`, elapsed_ms: elapsed };
    }
    const data = await res.json();
    const nome = data?.company?.name || data?.name || null;
    return { ok: true, status: 'success', message: `CNPJá OK${nome ? ` — ${nome}` : ''}`, elapsed_ms: elapsed };
  } catch (e: any) {
    return { ok: false, status: 'network_error', message: `Erro de rede: ${e.message}` };
  }
}

async function testReceitaWs(apiKey: string) {
  const start = Date.now();
  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${TEST_CNPJ}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    const elapsed = Date.now() - start;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 'auth_error', http: res.status, message: 'Token inválido na ReceitaWS.', elapsed_ms: elapsed };
    }
    if (res.status === 429) {
      return { ok: false, status: 'rate_limit', http: 429, message: 'Limite de requisições atingido (3/min no plano grátis).', elapsed_ms: elapsed };
    }
    if (!res.ok) {
      return { ok: false, status: 'http_error', http: res.status, message: `HTTP ${res.status} ao chamar ReceitaWS.`, elapsed_ms: elapsed };
    }
    const data = await res.json();
    if (data?.status === 'ERROR') {
      return { ok: false, status: 'api_error', message: data?.message || 'Erro na ReceitaWS.', elapsed_ms: elapsed };
    }
    return { ok: true, status: 'success', message: `ReceitaWS OK${data?.nome ? ` — ${data.nome}` : ''}`, elapsed_ms: elapsed };
  } catch (e: any) {
    return { ok: false, status: 'network_error', message: `Erro de rede: ${e.message}` };
  }
}

async function testEconodata(apiKey: string) {
  const start = Date.now();
  try {
    const res = await fetch(`https://api.econodata.com.br/v1/empresa/${TEST_CNPJ}`, {
      headers: { 'x-api-token': apiKey, 'Content-Type': 'application/json' },
    });
    const elapsed = Date.now() - start;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 'auth_error', http: res.status, message: 'Token inválido na Econodata.', elapsed_ms: elapsed };
    }
    if (!res.ok) {
      return { ok: false, status: 'http_error', http: res.status, message: `HTTP ${res.status} ao chamar Econodata.`, elapsed_ms: elapsed };
    }
    return { ok: true, status: 'success', message: 'Econodata OK — token válido.', elapsed_ms: elapsed };
  } catch (e: any) {
    return { ok: false, status: 'network_error', message: `Erro de rede: ${e.message}` };
  }
}

async function testBrasilApi() {
  const start = Date.now();
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${TEST_CNPJ}`, {
      headers: { Accept: 'application/json' },
    });
    const elapsed = Date.now() - start;
    if (!res.ok) {
      return { ok: false, status: 'http_error', http: res.status, message: `HTTP ${res.status} ao chamar BrasilAPI.`, elapsed_ms: elapsed };
    }
    const data = await res.json();
    return { ok: true, status: 'success', message: `BrasilAPI OK${data?.razao_social ? ` — ${data.razao_social}` : ''}`, elapsed_ms: elapsed };
  } catch (e: any) {
    return { ok: false, status: 'network_error', message: `Erro de rede: ${e.message}` };
  }
}
