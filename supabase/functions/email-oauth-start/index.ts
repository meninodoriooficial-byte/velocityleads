import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const REDIRECT_BASE = `${PROJECT_URL}/functions/v1/email-oauth-callback`;

async function sign(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SERVICE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(PROJECT_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { provider, return_to } = await req.json();
    if (provider !== "google" && provider !== "microsoft") {
      return new Response(JSON.stringify({ error: "invalid provider" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(PROJECT_URL, SERVICE_KEY);
    const { data: setting } = await admin.from("system_settings").select("setting_value").eq("setting_key", "email_oauth").maybeSingle();
    const cfg: any = setting?.setting_value || {};

    const statePayload = btoa(JSON.stringify({ u: user.id, p: provider, r: return_to || "", t: Date.now() }));
    const sig = await sign(statePayload);
    const state = `${statePayload}.${sig}`;
    const redirect_uri = `${REDIRECT_BASE}?provider=${provider}`;

    let url: string;
    if (provider === "google") {
      if (!cfg.google_client_id) return new Response(JSON.stringify({ error: "Google OAuth não configurado pelo admin" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const params = new URLSearchParams({
        client_id: cfg.google_client_id,
        redirect_uri,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
        access_type: "offline",
        prompt: "consent",
        state,
      });
      url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    } else {
      if (!cfg.microsoft_client_id) return new Response(JSON.stringify({ error: "Microsoft OAuth não configurado pelo admin" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const tenant = cfg.microsoft_tenant || "common";
      const params = new URLSearchParams({
        client_id: cfg.microsoft_client_id,
        redirect_uri,
        response_type: "code",
        response_mode: "query",
        scope: "offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read",
        state,
      });
      url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
    }

    return new Response(JSON.stringify({ url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});