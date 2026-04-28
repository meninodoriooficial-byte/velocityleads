import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Search as SearchIcon, RefreshCw, Sparkles } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LeadRow {
  id: string;
  business_name: string;
  business_type: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  social_media: any;
  rating: number | null;
  reviews_count: number | null;
  source_api: string | null;
  enriched_source: string | null;
  created_at: string;
  search_id: string;
  searches?: {
    category: string;
    state: string;
    city: string;
    neighborhood: string | null;
    search_query: string | null;
    created_at: string;
  };
}

export const AllUserResults = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("search_results")
        .select(
          "*, searches!inner(user_id, category, state, city, neighborhood, search_query, created_at)"
        )
        .eq("searches.user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e) {
      console.error("fetch all results error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.business_name,
        r.business_type,
        r.address,
        r.phone,
        r.email,
        r.website,
        r.searches?.category,
        r.searches?.city,
        r.searches?.state,
        r.searches?.neighborhood,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, filter]);

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const headers = [
      "Empresa", "Tipo", "Endereço", "Telefone", "Email", "Website",
      "Instagram", "Facebook", "Avaliação", "Reviews",
      "Busca (Categoria)", "Cidade", "Estado", "Bairro",
      "Fonte", "Enriquecido", "Capturado em",
    ];
    const data = filtered.map((r) => [
      r.business_name || "",
      r.business_type || "",
      r.address || "",
      r.phone || "",
      r.email || "",
      r.website || "",
      r.social_media?.instagram || "",
      r.social_media?.facebook || "",
      r.rating ?? "",
      r.reviews_count ?? "",
      r.searches?.category || "",
      r.searches?.city || "",
      r.searches?.state || "",
      r.searches?.neighborhood || "",
      r.source_api || "",
      r.enriched_source || "",
      new Date(r.created_at).toLocaleString("pt-BR"),
    ]);
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        row.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meus_leads_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle>Meus Resultados</CardTitle>
            <CardDescription>
              Todos os leads capturados em suas buscas — gravados no seu banco de dados.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </div>
        <div className="relative mt-4">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por nome, cidade, telefone, email..."
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground mt-2">
          {filtered.length} de {rows.length} lead{rows.length !== 1 ? "s" : ""}
        </div>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3" />
            <p className="text-muted-foreground">Carregando seus leads...</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            Você ainda não capturou nenhum lead. Faça uma busca em "Nova Busca".
          </p>
        ) : (
          <div className="border rounded-md overflow-x-auto bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Empresa</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead className="min-w-[200px]">Endereço</TableHead>
                  <TableHead>Busca</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Enriquecido</TableHead>
                  <TableHead>Capturado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.business_name}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {r.phone ? (
                        <a href={`tel:${r.phone}`} className="text-primary hover:underline">{r.phone}</a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.email ? (
                        <a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate">
                      {r.website ? (
                        <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{r.website}</a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">{r.address || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">{r.searches?.category || "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {r.searches ? `${r.searches.city}/${r.searches.state}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{r.source_api || "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.enriched_source ? (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="w-3 h-3 mr-1" />
                          {r.enriched_source}
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};