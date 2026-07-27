import { useState } from "react";
import { useUserAddons } from "@/hooks/useUserAddons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, MessageCircle, Loader2, Sparkles } from "lucide-react";

interface Props {
  onOpenAddon?: (slug: string) => void;
  paymentMode?: "test" | "live";
}

export const AddonsMarketplace = ({ onOpenAddon, paymentMode = "test" }: Props) => {
  const { catalog, isActive, loading, active } = useUserAddons();
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const { toast } = useToast();

  const buy = async (slug: string) => {
    setBuyingId(slug);
    try {
      const { data, error } = await supabase.functions.invoke("addon-purchase", {
        body: {
          addonSlug: slug,
          mode: paymentMode,
          returnUrl: `${window.location.origin}/payment/return`,
        },
      });
      if (error) {
        // A Edge Function retorna a mensagem real no corpo da resposta (error.context),
        // não em error.message (que é sempre o genérico "non-2xx status code").
        let friendly = error.message as string;
        try {
          const body = await error.context?.json?.();
          if (body?.message) friendly = body.message;
          else if (body?.error) friendly = body.error;
        } catch {
          // corpo não-JSON: mantém a mensagem original
        }
        throw new Error(friendly);
      }
      if (!data?.initPoint) throw new Error("Checkout não retornado");
      window.location.href = data.initPoint;
    } catch (e: any) {
      toast({ title: "Não foi possível iniciar a compra", description: e?.message, variant: "destructive" });
      setBuyingId(null);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando add-ons...</p>;

  if (catalog.length === 0)
    return <p className="text-sm text-muted-foreground">Nenhum add-on disponível no momento.</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {catalog.map((a) => {
        const activeRecord = active.find((u) => u.addon_slug === a.slug);
        const on = isActive(a.slug);
        const price = (a.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        return (
          <div
            key={a.slug}
            className="relative card-elevated p-6 flex flex-col gap-4 border border-border/60 hover:border-primary/40 transition-colors"
          >
            {on && (
              <Badge className="absolute -top-2 right-4 bg-green-600 hover:bg-green-600 text-white font-semibold tracking-wide gap-1">
                <CheckCircle2 className="size-3" /> ATIVO
              </Badge>
            )}
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <MessageCircle className="size-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-lg leading-tight">{a.name}</h3>
                <p className="text-xs text-muted-foreground capitalize">
                  {a.billing_period === "monthly" ? "Mensal" : a.billing_period === "yearly" ? "Anual" : "Único"}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed flex-1">{a.description}</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tabular-nums tracking-tight">{price}</span>
              {a.billing_period === "monthly" && (
                <span className="text-sm text-muted-foreground">/mês</span>
              )}
            </div>
            {a.monthly_quota != null && (
              <p className="text-xs text-muted-foreground">
                Cota: <strong>{a.monthly_quota.toLocaleString("pt-BR")}</strong> envios/mês
                {on && activeRecord && (
                  <span className="ml-1">
                    · Usados: {activeRecord.monthly_used}
                  </span>
                )}
              </p>
            )}
            {on ? (
              <Button onClick={() => onOpenAddon?.(a.slug)} className="w-full" variant="default">
                <Sparkles className="size-4 mr-2" /> Gerenciar
              </Button>
            ) : (
              <Button
                onClick={() => buy(a.slug)}
                disabled={buyingId === a.slug}
                className="w-full btn-volt"
              >
                {buyingId === a.slug ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                Ativar add-on
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};