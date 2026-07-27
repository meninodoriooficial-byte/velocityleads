import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
};

async function getAccessToken(
  admin: ReturnType<typeof createClient>,
  env: "test" | "live",
): Promise<string | null> {
  const keyName =
    env === "live"
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
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    let payload: any = {};
    try {
      payload = await req.json();
    } catch (_) {
      // MP às vezes manda só query params
    }

    // Identificar tipo + id do recurso
    const type =
      payload?.type ||
      payload?.topic ||
      url.searchParams.get("type") ||
      url.searchParams.get("topic");
    const dataId =
      payload?.data?.id ||
      url.searchParams.get("data.id") ||
      url.searchParams.get("id");

    console.log("MP webhook received", { type, dataId, payload });

    if (!type || !dataId) {
      // Confirmar mesmo sem ação para o MP não ficar reentregando
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (String(type) !== "payment") {
      return new Response(JSON.stringify({ ok: true, skipped: type }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tentar buscar pagamento em produção, depois teste
    let mpPayment: any = null;
    let envUsed: "test" | "live" = "live";
    for (const env of ["live", "test"] as const) {
      const token = await getAccessToken(admin, env);
      if (!token) continue;
      const r = await fetch(
        `https://api.mercadopago.com/v1/payments/${dataId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (r.ok) {
        mpPayment = await r.json();
        envUsed = env;
        break;
      }
    }

    if (!mpPayment) {
      console.error("Pagamento não encontrado no MP", dataId);
      return new Response(
        JSON.stringify({ ok: false, error: "payment_not_found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const externalRef =
      mpPayment.external_reference || mpPayment.metadata?.order_id;
    if (!externalRef) {
      return new Response(
        JSON.stringify({ ok: false, error: "no_external_reference" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: order, error: orderErr } = await admin
      .from("payment_orders")
      .select("*")
      .eq("id", externalRef)
      .maybeSingle();
    if (orderErr || !order) {
      console.error("Pedido não encontrado", externalRef, orderErr);
      return new Response(JSON.stringify({ ok: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mpStatus: string = mpPayment.status; // approved, pending, rejected...
    const newStatus =
      mpStatus === "approved"
        ? "approved"
        : mpStatus === "pending" || mpStatus === "in_process"
          ? "pending"
          : "rejected";

    // Idempotência: só credita se ainda não estava aprovado
    const wasAlreadyApproved = order.status === "approved";

    await admin
      .from("payment_orders")
      .update({
        status: newStatus,
        payment_id: String(mpPayment.id),
        environment: envUsed,
        raw_response: mpPayment,
      })
      .eq("id", order.id);

    if (newStatus === "approved" && !wasAlreadyApproved) {
      // ===== Add-on =====
      if (order.order_kind === "addon" && order.addon_slug) {
        const { data: addonDef } = await admin
          .from("addons")
          .select("*")
          .eq("slug", order.addon_slug)
          .maybeSingle();
        const now = new Date();

        // Renova ou cria
        const { data: existing } = await admin
          .from("user_addons")
          .select("*")
          .eq("user_id", order.user_id)
          .eq("addon_slug", order.addon_slug)
          .maybeSingle();

        // Base para calcular a nova validade: se o add-on ainda está válido
        // (expires_at no futuro), soma o período ao tempo restante (renovação
        // acumulativa). Caso contrário, conta a partir de agora.
        const addDays =
          addonDef?.billing_period === "yearly"
            ? 365
            : addonDef?.billing_period === "monthly"
              ? 30
              : null;
        let baseDate = now;
        if (existing?.expires_at) {
          const currentExp = new Date(existing.expires_at);
          if (currentExp.getTime() > now.getTime()) baseDate = currentExp;
        }
        const expires =
          addDays != null
            ? new Date(baseDate.getTime() + addDays * 24 * 3600 * 1000)
            : null;

        if (existing) {
          await admin
            .from("user_addons")
            .update({
              status: "active",
              activated_at: now.toISOString(),
              expires_at: expires?.toISOString() || null,
              monthly_quota: addonDef?.monthly_quota ?? existing.monthly_quota,
              quota_reset_at: new Date(
                now.getFullYear(),
                now.getMonth() + 1,
                1,
              ).toISOString(),
              payment_order_id: order.id,
            })
            .eq("id", existing.id);
        } else {
          await admin.from("user_addons").insert({
            user_id: order.user_id,
            addon_slug: order.addon_slug,
            status: "active",
            activated_at: now.toISOString(),
            expires_at: expires?.toISOString() || null,
            monthly_quota: addonDef?.monthly_quota ?? null,
            monthly_used: 0,
            payment_order_id: order.id,
          });
        }
        console.log("Add-on ativado", { user: order.user_id, slug: order.addon_slug });

        // Hooks de ativação por slug
        if (order.addon_slug === "whatsapp_crm") {
          try {
            await admin.rpc("crm_seed_default_pipeline", { _user_id: order.user_id });
          } catch (e) { console.error("crm seed failed", e); }
        }

        return new Response(JSON.stringify({ ok: true, status: newStatus, kind: "addon" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== Pacote de buscas (fluxo original) =====
      const { data: profile } = await admin
        .from("profiles")
        .select("*")
        .eq("user_id", order.user_id)
        .maybeSingle();
      const { data: pkg } = await admin
        .from("search_packages")
        .select("*")
        .eq("id", order.package_id)
        .maybeSingle();

      if (profile && pkg) {
        // Soma o limite do pacote ao limite atual
        const newLimit =
          (profile.plan_searches_limit || 0) + (pkg.searches_limit || 0);
        await admin
          .from("profiles")
          .update({
            plan_searches_limit: newLimit,
            plan: pkg.name.toLowerCase(),
          })
          .eq("user_id", order.user_id);
        console.log("Crédito aplicado", {
          user: order.user_id,
          newLimit,
          pkg: pkg.name,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, status: newStatus }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("webhook error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});