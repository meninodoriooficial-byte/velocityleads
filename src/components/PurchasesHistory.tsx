import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Receipt, Wallet, Search as SearchIcon, ShoppingBag } from "lucide-react";

type Order = {
  id: string;
  package_id: string;
  amount: number;
  searches_credited: number;
  status: string;
  environment: string;
  preference_id: string | null;
  payment_id: string | null;
  created_at: string;
};

type PackageRow = { id: string; name: string };

const STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  approved: { label: "Pago", className: "bg-success/15 text-success border-success/30" },
  pending: { label: "Pendente", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  rejected: { label: "Cancelado", className: "bg-destructive/15 text-destructive border-destructive/30" },
  failed: { label: "Falhou", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

function formatStatus(status: string) {
  return STATUS_META[status] || { label: status, className: "bg-muted text-muted-foreground border-border" };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function PurchasesHistory() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [packages, setPackages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: ordersData } = await supabase
      .from("payment_orders")
      .select(
        "id, package_id, amount, searches_credited, status, environment, preference_id, payment_id, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const orderRows = (ordersData || []) as Order[];
    setOrders(orderRows);

    const ids = Array.from(new Set(orderRows.map((o) => o.package_id)));
    if (ids.length > 0) {
      const { data: pkgs } = await supabase
        .from("search_packages")
        .select("id, name")
        .in("id", ids);
      const map: Record<string, string> = {};
      (pkgs as PackageRow[] | null)?.forEach((p) => (map[p.id] = p.name));
      setPackages(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // realtime: atualiza quando o webhook mudar o status
    if (!user) return;
    const channel = supabase
      .channel(`orders-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payment_orders",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const totalPaid = orders
    .filter((o) => o.status === "approved")
    .reduce((s, o) => s + Number(o.amount || 0), 0);
  const totalCredited = orders
    .filter((o) => o.status === "approved")
    .reduce((s, o) => s + (o.searches_credited || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="surface-raised p-5 flex items-center gap-4">
          <div className="size-11 rounded-xl bg-success/10 text-success flex items-center justify-center">
            <Wallet className="size-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total pago</div>
            <div className="text-2xl font-bold tabular-nums mt-0.5">{formatBRL(totalPaid)}</div>
          </div>
        </div>
        <div className="surface-raised p-5 flex items-center gap-4">
          <div className="size-11 rounded-xl bg-accent/15 text-accent-foreground flex items-center justify-center">
            <SearchIcon className="size-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Buscas adquiridas</div>
            <div className="text-2xl font-bold tabular-nums mt-0.5">{totalCredited}</div>
          </div>
        </div>
        <div className="surface-raised p-5 flex items-center gap-4">
          <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ShoppingBag className="size-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pedidos</div>
            <div className="text-2xl font-bold tabular-nums mt-0.5">{orders.length}</div>
          </div>
        </div>
      </div>

      <div className="surface-raised p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Receipt className="size-5" /> Histórico de compras
          </h3>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : orders.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            Você ainda não realizou nenhuma compra.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-semibold">Data</th>
                  <th className="py-2 pr-3 font-semibold">Pacote</th>
                  <th className="py-2 pr-3 font-semibold">Buscas</th>
                  <th className="py-2 pr-3 font-semibold">Valor</th>
                  <th className="py-2 pr-3 font-semibold">Ambiente</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const meta = formatStatus(o.status);
                  return (
                    <tr key={o.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-3 text-muted-foreground">{formatDate(o.created_at)}</td>
                      <td className="py-3 pr-3 font-medium">
                        {packages[o.package_id] || "—"}
                      </td>
                      <td className="py-3 pr-3 tabular-nums">{o.searches_credited}</td>
                      <td className="py-3 pr-3 tabular-nums font-medium">
                        {formatBRL(Number(o.amount || 0))}
                      </td>
                      <td className="py-3 pr-3">
                        <Badge variant="outline" className="text-[10px]">
                          {o.environment === "live" ? "Produção" : "Teste"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge variant="outline" className={meta.className}>
                          {meta.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default PurchasesHistory;