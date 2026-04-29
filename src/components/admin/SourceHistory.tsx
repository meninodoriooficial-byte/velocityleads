import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw, Database } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SourceRow {
  source_api: string | null;
  total: number;
}

export const SourceHistory = () => {
  const [aggregated, setAggregated] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("search_results")
        .select("source_api");

      if (error) throw error;

      const counts = new Map<string, number>();
      for (const r of data || []) {
        const key = r.source_api || "desconhecido";
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const agg: SourceRow[] = Array.from(counts.entries())
        .map(([source_api, total]) => ({ source_api, total }))
        .sort((a, b) => b.total - a.total);
      setAggregated(agg);
    } catch (e) {
      console.error("Erro ao carregar histórico de fontes", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalAcoes = aggregated.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Total de ações registradas:{" "}
          <span className="font-semibold text-foreground tabular-nums">{totalAcoes}</span>
        </p>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>
      {aggregated.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Database className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Nenhuma ação registrada ainda.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integração / Fonte</TableHead>
                <TableHead className="text-right">Ações realizadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggregated.map((row) => (
                <TableRow key={row.source_api ?? "x"}>
                  <TableCell className="font-medium capitalize">
                    {row.source_api ?? "desconhecido"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {row.total}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};