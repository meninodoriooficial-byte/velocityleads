import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return j({ ok: false, error: "missing_auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = authHeader.replace("Bearer ", "").trim();
    const admin = createClient(SUPABASE_URL, SERVICE);

    let userId: string | null = null;
    const { data: userData } = await admin.auth.getUser(token);
    userId = userData?.user?.id ?? null;

    if (!userId) {
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claimsData } = await userClient.auth.getClaims(token);
      userId = (claimsData?.claims?.sub as string) ?? null;
    }
    if (!userId) return j({ ok: false, error: "invalid_session" }, 401);

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return j({ ok: false, error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const keyName = String(body.key_name || "").trim();
    if (!keyName) return j({ ok: false, error: "missing_key_name" }, 400);

    const { data, error } = await admin.rpc("get_api_key_decrypted", { _key_name: keyName });
    if (error) return j({ ok: false, error: error.message }, 500);
    const value = (data as string) || "";
    if (!value) return j({ ok: false, error: "not_configured" }, 404);
    return j({ ok: true, key_name: keyName, value });
  } catch (e) {
    return j({ ok: false, error: String(e) }, 500);
  }
});