import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller via JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      console.error("getUser error:", userErr);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, payload } = body as { action: string; payload: any };

    switch (action) {
      case "list": {
        const { data: profiles, error } = await admin
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;

        const { data: roles } = await admin.from("user_roles").select("user_id, role");
        const rolesByUser: Record<string, string[]> = {};
        (roles || []).forEach((r: any) => {
          rolesByUser[r.user_id] = rolesByUser[r.user_id] || [];
          rolesByUser[r.user_id].push(r.role);
        });

        const enriched = (profiles || []).map((p: any) => ({
          ...p,
          roles: rolesByUser[p.user_id] || [],
        }));

        return json({ users: enriched });
      }

      case "create": {
        const { email, password, full_name, plan, plan_searches_limit, is_admin } = payload;
        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: full_name || "" },
        });
        if (error) throw error;

        // Wait briefly for trigger then update profile
        await admin
          .from("profiles")
          .update({
            full_name: full_name || "",
            plan: plan || "basic",
            plan_searches_limit: plan_searches_limit ?? 10,
          })
          .eq("user_id", created.user.id);

        if (is_admin) {
          await admin.from("user_roles").insert({ user_id: created.user.id, role: "admin" });
        }
        return json({ ok: true, user_id: created.user.id });
      }

      case "update_profile": {
        const { user_id, full_name, plan, plan_searches_limit, is_suspended } = payload;
        const update: any = {};
        if (full_name !== undefined) update.full_name = full_name;
        if (plan !== undefined) update.plan = plan;
        if (plan_searches_limit !== undefined) update.plan_searches_limit = plan_searches_limit;
        if (is_suspended !== undefined) update.is_suspended = is_suspended;
        const { error } = await admin.from("profiles").update(update).eq("user_id", user_id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "change_password": {
        const { user_id, password } = payload;
        const { error } = await admin.auth.admin.updateUserById(user_id, { password });
        if (error) throw error;
        return json({ ok: true });
      }

      case "suspend": {
        const { user_id, suspend } = payload;
        // ban or unban via auth admin
        const { error: authErr } = await admin.auth.admin.updateUserById(user_id, {
          ban_duration: suspend ? "876000h" : "none",
        });
        if (authErr) throw authErr;
        await admin.from("profiles").update({ is_suspended: !!suspend }).eq("user_id", user_id);
        return json({ ok: true });
      }

      case "delete": {
        const { user_id } = payload;
        if (user_id === callerId) {
          return json({ error: "Cannot delete yourself" }, 400);
        }
        const { error } = await admin.auth.admin.deleteUser(user_id);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e: any) {
    console.error("admin-users error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}