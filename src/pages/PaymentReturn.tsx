import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";

type OrderStatus = "approved" | "pending" | "rejected" | "failed" | string;

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const orderId = params.get("order");
  const initialStatus = params.get("status");
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    let stopped = false;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      const { data } = await supabase
        .from("payment_orders")
        .select("status")
        .eq("id", orderId)
        .maybeSingle();
      if (stopped) return;
      if (data) setStatus(data.status as OrderStatus);
      setLoading(false);
      if (data?.status !== "approved" && attempts < 12) {
        setTimeout(poll, 2500);
      }
    };
    poll();
    return () => {
      stopped = true;
    };
  }, [orderId]);

  const isApproved = status === "approved";
  const isRejected = status === "rejected" || status === "failed" || initialStatus === "failure";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3">
            {loading ? (
              <Loader2 className="size-12 animate-spin text-muted-foreground" />
            ) : isApproved ? (
              <CheckCircle2 className="size-12 text-success" />
            ) : isRejected ? (
              <XCircle className="size-12 text-destructive" />
            ) : (
              <Clock className="size-12 text-muted-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {loading
              ? "Confirmando pagamento..."
              : isApproved
                ? "Pagamento aprovado!"
                : isRejected
                  ? "Pagamento não concluído"
                  : "Pagamento em processamento"}
          </CardTitle>
          <CardDescription>
            {isApproved
              ? "Suas buscas já foram creditadas no seu plano."
              : isRejected
                ? "Não foi possível concluir a compra. Você pode tentar novamente."
                : "Estamos aguardando a confirmação do Mercado Pago. Esta página atualiza automaticamente."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild>
            <Link to="/dashboard">Voltar ao painel</Link>
          </Button>
          {!isApproved && !loading && (
            <Button asChild variant="ghost">
              <Link to="/dashboard?tab=plans">Ver pacotes</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}