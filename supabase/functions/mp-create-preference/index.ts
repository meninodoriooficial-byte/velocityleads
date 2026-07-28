import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Mode = "test" | "live";

async function getMpAccessToken(
  admin: ReturnType<typeof createClient>,
  mode: Mode,
): Promise<string | null> {
  const keyName =
    mode === "live"
      ? "MERCADO_PAGO_ACCESS_TOKEN_LIVE"
      : "MERCADO_PAGO_ACCESS_TOKEN_TEST";
  const { data, error } = await admin.rpc("get_api_key_decrypted", {
    _key_name: keyName,
  });
  if (error) {
    console.error("get_api_key_decrypted error", error);
    return null;
  }
  return (data as string) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente para identificar o usuário a partir do JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid_user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const packageId: string | undefined = body.packageId;
    const returnUrl: string =
      body.returnUrl || `${req.headers.get("origin") || ""}/payment/return`;

    if (!packageId) {
      return new Response(JSON.stringify({ error: "missing_packageId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role para ler pacote e criar pedido
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // O modo (test/live) é configuração GLOBAL do admin, não vem do cliente.
    const { data: modeSetting } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "payments_mode")
      .maybeSingle();
    const mode: Mode = modeSetting?.setting_value === "live" ? "live" : "test";

    // Verifica se o ambiente está habilitado pelo admin
    const { data: envSetting } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "payments_env_toggles")
      .maybeSingle();
    const envVal = (envSetting?.setting_value as any) || {};
    const envEnabled = mode === "live" ? envVal.live_enabled === true : envVal.test_enabled !== false;
    if (!envEnabled) {
      return new Response(
        JSON.stringify({
          error: "env_disabled",
          message: `Ambiente de ${mode === "live" ? "produção" : "teste"} está desligado pelo admin.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: pkg, error: pkgErr } = await admin
      .from("search_packages")
      .select("*")
      .eq("id", packageId)
      .eq("is_active", true)
      .maybeSingle();
    if (pkgErr || !pkg) {
      return new Response(JSON.stringify({ error: "package_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getMpAccessToken(admin, mode);
    if (!accessToken) {
      return new Response(
        JSON.stringify({
          error: "mp_token_missing",
          message: `Configure o Access Token de ${mode === "live" ? "produção" : "teste"} no painel admin.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Cria pedido pendente
    const { data: order, error: orderErr } = await admin
      .from("payment_orders")
      .insert({
        user_id: user.id,
        package_id: pkg.id,
        provider: "mercado_pago",
        environment: mode,
        amount: pkg.price,
        searches_credited: pkg.searches_limit,
        status: "pending",
      })
      .select()
      .single();
    if (orderErr || !order) {
      console.error("order insert error", orderErr);
      return new Response(JSON.stringify({ error: "order_create_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl = `${SUPABASE_URL}/functions/v1/mp-webhook`;

    const preferencePayload = {
      items: [
        {
          id: pkg.id,
          title: pkg.name,
          description: pkg.description || pkg.name,
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number(pkg.price),
        },
      ],
      payer: { email: user.email },
      external_reference: order.id,
      back_urls: {
        success: `${returnUrl}?order=${order.id}&status=success`,
        pending: `${returnUrl}?order=${order.id}&status=pending`,
        failure: `${returnUrl}?order=${order.id}&status=failure`,
      },
      auto_return: "approved",
      notification_url: webhookUrl,
      metadata: {
        order_id: order.id,
        user_id: user.id,
        package_id: pkg.id,
        environment: mode,
      },
    };

    const mpRes = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preferencePayload),
      },
    );
    const mpJson = await mpRes.json();

    if (!mpRes.ok) {
      console.error("MP error", mpRes.status, mpJson);
      await admin
        .from("payment_orders")
        .update({ status: "failed", raw_response: mpJson })
        .eq("id", order.id);
      return new Response(
        JSON.stringify({
          error: "mp_preference_failed",
          status: mpRes.status,
          details: mpJson,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    await admin
      .from("payment_orders")
      .update({
        preference_id: mpJson.id,
        raw_response: mpJson,
      })
      .eq("id", order.id);

    const initPoint =
      mode === "live" ? mpJson.init_point : mpJson.sandbox_init_point;

    return new Response(
      JSON.stringify({
        orderId: order.id,
        preferenceId: mpJson.id,
        initPoint,
        mode,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("unexpected error", e);
    return new Response(
      JSON.stringify({ error: "unexpected", message: String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});