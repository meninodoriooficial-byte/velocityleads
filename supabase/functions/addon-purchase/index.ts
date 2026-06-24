// Cria uma preferência do Mercado Pago para compra/renovação de um add-on.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getMpToken(admin: any, env: "test" | "live") {
  const keyName = env === "live" ? "MERCADO_PAGO_ACCESS_TOKEN_LIVE" : "MERCADO_PAGO_ACCESS_TOKEN_TEST";
  const { data } = await admin.rpc("get_api_key_decrypted", { _key_name: keyName });
  return (data as string) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return j({ error: "missing_auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    const user = u?.user;
    if (!user) return j({ error: "invalid_user" }, 401);

    const body = await req.json().catch(() => ({}));
    const slug = String(body.addonSlug || "");
    const mode: "test" | "live" = body.mode === "live" ? "live" : "test";
    const returnUrl = body.returnUrl || `${req.headers.get("origin") || ""}/payment/return`;
    if (!slug) return j({ error: "missing_addonSlug" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: addon } = await admin.from("addons").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
    if (!addon) return j({ error: "addon_not_found" }, 404);

    // Dependência: whatsapp_crm exige whatsapp ativo
    if (slug === "whatsapp_crm") {
      const { data: wa } = await admin
        .from("user_addons").select("id").eq("user_id", user.id).eq("addon_slug", "whatsapp").eq("status", "active").maybeSingle();
      if (!wa) return j({ error: "missing_dependency", message: "Ative primeiro o add-on WhatsApp." }, 400);
    }

    const token = await getMpToken(admin, mode);
    if (!token) return j({ error: "mp_token_missing", message: `Configure o Access Token de ${mode === "live" ? "produção" : "teste"} no painel admin.` }, 400);

    const price = Number(addon.price_cents) / 100;
    const { data: order } = await admin
      .from("payment_orders")
      .insert({
        user_id: user.id,
        provider: "mercado_pago",
        environment: mode,
        amount: price,
        status: "pending",
        order_kind: "addon",
        addon_slug: addon.slug,
        searches_credited: 0,
      })
      .select()
      .single();
    if (!order) return j({ error: "order_create_failed" }, 500);

    const webhookUrl = `${SUPABASE_URL}/functions/v1/mp-webhook`;
    const pref = {
      items: [{
        id: addon.slug,
        title: `Add-on: ${addon.name}`,
        description: addon.description || addon.name,
        quantity: 1,
        currency_id: "BRL",
        unit_price: price,
      }],
      payer: { email: user.email },
      external_reference: order.id,
      back_urls: {
        success: `${returnUrl}?order=${order.id}&status=success`,
        pending: `${returnUrl}?order=${order.id}&status=pending`,
        failure: `${returnUrl}?order=${order.id}&status=failure`,
      },
      auto_return: "approved",
      notification_url: webhookUrl,
      metadata: { order_id: order.id, user_id: user.id, addon_slug: addon.slug, environment: mode, kind: "addon" },
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(pref),
    });
    const mpJson = await mpRes.json();
    if (!mpRes.ok) {
      await admin.from("payment_orders").update({ status: "failed", raw_response: mpJson }).eq("id", order.id);
      return j({ error: "mp_preference_failed", status: mpRes.status, details: mpJson }, 502);
    }
    await admin.from("payment_orders").update({ preference_id: mpJson.id, raw_response: mpJson }).eq("id", order.id);
    const initPoint = mode === "live" ? mpJson.init_point : mpJson.sandbox_init_point;
    return j({ orderId: order.id, initPoint, mode });
  } catch (e) {
    return j({ error: "unexpected", message: String(e) }, 500);
  }
});

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}