import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPER_ADMIN_EMAIL = "superadmin@admin.com";
const SUPER_ADMIN_PASSWORD = "SuperAdmin@2026";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Try to create the user; if it already exists, look it up via profiles/sign-in.
    let userId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Super Admin" },
    });

    if (createErr) {
      const msg = (createErr.message || "").toLowerCase();
      const alreadyExists =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists") ||
        (createErr as any).code === "email_exists";
      if (!alreadyExists) throw createErr;

      // Recover the existing user id by signing in with the desired password.
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const anonClient = createClient(supabaseUrl, anonKey);
      const { data: signIn, error: signErr } = await anonClient.auth.signInWithPassword({
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD,
      });
      if (signIn?.user?.id) {
        userId = signIn.user.id;
      } else {
        // Password drifted — find the id via the profiles table (linked by email is not stored,
        // so fall back to scanning user_roles + profiles by full_name marker if present).
        if (signErr) console.warn("sign-in probe failed:", signErr.message);
      }
    } else {
      userId = created.user.id;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({
          error:
            "Super admin already exists with a different password. Reset it manually or delete the user.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure profile
    await admin
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          full_name: "Super Admin",
          plan: "premium",
          plan_searches_limit: 999999,
          is_suspended: false,
        },
        { onConflict: "user_id" }
      );

    // Ensure admin role
    const { data: existingRole } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!existingRole) {
      await admin.from("user_roles").insert({ user_id: userId, role: "admin" });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("bootstrap-admin error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});