import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

interface RecentRow {
  id: string;
  business_name: string;
  source_api: string | null;
  created_at: string;
}

export const SourceHistory = () => {
  const [aggregated, setAggregated] = useState<SourceRow[]>([]);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("search_results")
        .select("id, business_name, source_api, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      const rows = (data || []) as RecentRow[];
      setRecent(rows.slice(0, 25));

      const counts = new Map<string, number>();
      for (const r of rows) {
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Histórico de Fontes dos Leads
          </CardTitle>
          <CardDescription>
            De qual API cada lead foi obtido (últimos 500 registros).
          </CardDescription>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="text-sm font-medium mb-3">Resumo por fonte</h4>
          {aggregated.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dado ainda.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {aggregated.map((row) => (
                <Badge key={row.source_api ?? "x"} variant="secondary" className="text-sm">
                  {row.source_api ?? "desconhecido"} · {row.total}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-medium mb-3">Leads mais recentes</h4>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lead encontrado.</p>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Fonte (API)</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.business_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.source_api ?? "desconhecido"}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};