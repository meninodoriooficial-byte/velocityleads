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

    // Try to find existing user by listing (paged) — efficient enough for bootstrap.
    let userId: string | null = null;
    let page = 1;
    while (page < 20) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const found = data.users.find((u) => u.email?.toLowerCase() === SUPER_ADMIN_EMAIL);
      if (found) {
        userId = found.id;
        break;
      }
      if (data.users.length < 200) break;
      page++;
    }

    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Super Admin" },
      });
      if (createErr) throw createErr;
      userId = created.user.id;
    } else {
      // Ensure password is in sync and account active.
      await admin.auth.admin.updateUserById(userId, {
        password: SUPER_ADMIN_PASSWORD,
        email_confirm: true,
        ban_duration: "none",
      });
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