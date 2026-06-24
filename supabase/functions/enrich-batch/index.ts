import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FUNCTIONS_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Não autenticado" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Sessão inválida" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { searchId, onlyMissing = true, limit = 100 } = await req.json();
    if (!searchId) return json({ error: "searchId obrigatório" }, 400);

    // Valida dono da busca
    const { data: search, error: sErr } = await supabase
      .from("searches")
      .select("id, user_id")
      .eq("id", searchId)
      .maybeSingle();
    if (sErr || !search) return json({ error: "Busca não encontrada" }, 404);
    if (search.user_id !== userId) return json({ error: "Sem permissão" }, 403);

    // Seleciona resultados — por padrão só os ainda não enriquecidos
    let query = supabase
      .from("search_results")
      .select("id, enriched_at, email")
      .eq("search_id", searchId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(1, Number(limit) || 100), 200));
    if (onlyMissing) {
      query = query.is("enriched_at", null);
    }
    const { data: rows, error: rErr } = await query;
    if (rErr) throw rErr;

    const ids = (rows || []).map((r) => r.id);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // Processa em paralelo limitado para não sobrecarregar
    const CONCURRENCY = 3;
    let cursor = 0;
    async function worker() {
      while (cursor < ids.length) {
        const i = cursor++;
        const id = ids[i];
        try {
          const r = await fetch(`${FUNCTIONS_BASE}/enrich-lead`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
            },
            body: JSON.stringify({ resultId: id }),
          });
          if (r.ok) success++;
          else {
            failed++;
            if (errors.length < 5) {
              errors.push(`${id}: HTTP ${r.status}`);
            }
          }
        } catch (e: any) {
          failed++;
          if (errors.length < 5) errors.push(`${id}: ${e?.message || "erro"}`);
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    return json({
      success: true,
      total: ids.length,
      enriched: success,
      failed,
      errors,
    });
  } catch (error: any) {
    console.error("enrich-batch error:", error);
    return json({ error: error?.message || "Erro interno" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}