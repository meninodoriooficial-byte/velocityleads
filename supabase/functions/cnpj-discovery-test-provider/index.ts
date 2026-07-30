import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getProviderBySlug } from "../_shared/cnpj-discovery/providers/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sempre retorna HTTP 200 — erros são sinalizados via ok:false no corpo.
// Um status não-2xx faz o supabase-js descartar o corpo da resposta e
// mostrar só "Edge Function returned a non-2xx status code" no cliente,
// escondendo a mensagem real. Padrão idêntico ao já usado em test-api.
function result(ok: boolean, message: string, latencyMs = 0) {
  return new Response(JSON.stringify({ ok, message, latencyMs }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return result(false, "Não autenticado");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return result(false, "Sessão inválida");
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return result(false, "Acesso restrito a administradores");

    const body = await req.json().catch(() => ({}));
    const slug: string = body.slug;
    if (!slug) return result(false, "slug obrigatório");

    const provider = getProviderBySlug(slug, supabase);
    if (!provider) return result(false, "Provider desconhecido ou ainda não implementado");

    const test = await provider.testConnection();
    return result(test.ok, test.message, test.latencyMs);
  } catch (e) {
    console.error("cnpj-discovery-test-provider error", e);
    return result(false, `Erro interno: ${e instanceof Error ? e.message : String(e)}`);
  }
});
