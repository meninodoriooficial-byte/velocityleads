import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ResultsList } from "./ResultsList";
import { toast } from "sonner";

interface ResultsSectionProps {
  searchData: any;
}

export const ResultsSection = ({ searchData }: ResultsSectionProps) => {
  const [allResults, setAllResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [planLimit, setPlanLimit] = useState<number | null>(null);
  const [batchNumber, setBatchNumber] = useState(0);
  const [isFetchingBatch, setIsFetchingBatch] = useState(false);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (searchData?.id) {
      setAllResults([]);
      setCurrentPage(1);
      setHasMore(true);
      setBatchNumber(0);
      fetchResults(true);
    }
  }, [searchData?.id]);

  const fetchResults = async (isNewSearch = false) => {
    if (!searchData?.id) return;
    
    setLoading(true);
    setIsFetchingBatch(true);
    setBatchNumber((n) => n + 1);
    try {
      // Garantir sessão válida antes de chamar a edge function
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        const exp = sessionData.session.expires_at ?? 0;
        const now = Math.floor(Date.now() / 1000);
        if (exp - now < 60) {
          await supabase.auth.refreshSession();
        }
      }

      if (isNewSearch) {
        // Para nova busca, buscar resultados existentes primeiro
        const { data: existingData, error: existingError } = await supabase
          .from('search_results')
          .select('*')
          .eq('search_id', searchData.id)
          .order('created_at', { ascending: false });

        if (existingError) throw existingError;

        if (existingData && existingData.length > 0) {
          setAllResults(existingData);
          setHasMore(true); // permite "capturar mais 100"
          setLoading(false);
          return;
        }
      }

      // Chamar a nova função de busca web
      const { data: functionData, error: functionError } = await supabase.functions.invoke('web-search', {
        body: {
          searchId: searchData.id,
          category: searchData.category,
          state: searchData.state,
          city: searchData.city,
          neighborhood: searchData.neighborhood,
          page: currentPage
        }
      });

      if (functionError) {
        const { explainEdgeError } = await import("@/lib/edgeFunction");
        const ex = explainEdgeError(functionError, functionData);
        toast.error(ex.title, { description: ex.description });
        throw functionError;
      }

      // Buscar os novos resultados
      const { data: newResults, error: fetchError } = await supabase
        .from('search_results')
        .select('*')
        .eq('search_id', searchData.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setAllResults(newResults || []);

      // hasMore vem da edge function (respeita limite do plano)
      const more = !!(functionData && (functionData as any).hasMore);
      setHasMore(more);
      if ((functionData as any)?.planLimit) {
        setPlanLimit((functionData as any).planLimit);
      }
      if ((functionData as any)?.planReached) {
        toast.info("Limite do plano atingido", {
          description: `Você capturou ${(functionData as any).totalCount} de ${(functionData as any).planLimit} leads do seu plano.`,
        });
      } else if (!isNewSearch && (functionData as any)?.resultsCount === 0) {
        toast.info("Sem novos resultados", {
          description: "Não encontramos novos leads para este lote.",
        });
      }
      
    } catch (error) {
      console.error('Error fetching results:', error);
      setHasMore(false);
    } finally {
      setLoading(false);
      setIsFetchingBatch(false);
    }
  };

  const loadMoreResults = () => {
    if (!loading && hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  };

  // Carregar mais quando a página muda
  useEffect(() => {
    if (currentPage > 1 && searchData?.id) {
      fetchResults(false);
    }
  }, [currentPage]);

  const exportToCSV = () => {
    if (allResults.length === 0) return;

    const csvHeaders = [
      'Nome da Empresa',
      'Tipo de Negócio',
      'Endereço',
      'Telefone',
      'Email',
      'Website',
      'Nome do Proprietário',
      'Avaliação',
      'Número de Avaliações',
      'Instagram',
      'Facebook',
      'Horário de Funcionamento',
      'Serviços',
      'Faixa de Preço'
    ];

    const csvData = allResults.map((result: any) => [
      result.business_name || '',
      result.business_type || '',
      result.address || '',
      result.phone || '',
      result.email || '',
      result.website || '',
      result.owner_name || '',
      result.rating || '',
      result.reviews_count || '',
      result.social_media?.instagram || '',
      result.social_media?.facebook || '',
      result.additional_data?.hours || '',
      result.additional_data?.services?.join('; ') || '',
      result.additional_data?.price_range || ''
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvData.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_${searchData?.search_query?.replace(/\s+/g, '_') || 'busca'}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const refreshResults = () => {
    setAllResults([]);
    setCurrentPage(1);
    setHasMore(true);
    fetchResults(true);
  };

  const enrichAll = async () => {
    if (!searchData?.id || enriching) return;
    const missing = allResults.filter((r: any) => !r.enriched_at).length;
    if (missing === 0) {
      toast.info("Todos já enriquecidos", { description: "Nenhum lead pendente neste lote." });
      return;
    }
    setEnriching(true);
    toast.info("Enriquecendo leads...", {
      description: `Buscando CNPJ, e-mails e dados extras de ${missing} lead(s). Isso pode levar alguns minutos.`,
    });
    try {
      const { data, error } = await supabase.functions.invoke("enrich-batch", {
        body: { searchId: searchData.id, onlyMissing: true, limit: 100 },
      });
      if (error) throw error;
      const enriched = (data as any)?.enriched ?? 0;
      const failed = (data as any)?.failed ?? 0;
      toast.success("Enriquecimento concluído", {
        description: `${enriched} lead(s) enriquecido(s)${failed ? `, ${failed} falha(s)` : ""}.`,
      });
      // Recarrega resultados do banco para mostrar os campos atualizados
      const { data: refreshed } = await supabase
        .from("search_results")
        .select("*")
        .eq("search_id", searchData.id)
        .order("created_at", { ascending: false });
      if (refreshed) setAllResults(refreshed);
    } catch (e: any) {
      console.error("enrich-batch error", e);
      toast.error("Falha ao enriquecer", { description: e?.message || "Tente novamente." });
    } finally {
      setEnriching(false);
    }
  };

  if (!searchData) return null;

  const searchStatus = allResults.length > 0 ? 'completed' : (searchData.status || 'pending');
  const isLoading = loading && allResults.length === 0;

  return (
    <section id="results-section" className="space-y-5">
      <div className="surface-raised p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Badge
                variant={searchStatus === 'completed' ? 'default' : 'secondary'}
                className={searchStatus === 'completed' ? 'bg-success/15 text-success border-success/30' : ''}
              >
                <span className={`size-1.5 rounded-full mr-1.5 ${searchStatus === 'completed' ? 'bg-success' : 'bg-muted-foreground animate-pulse'}`} />
                {searchStatus === 'completed' ? 'Concluída' : 'Processando...'}
              </Badge>
              {allResults.length > 0 && (
                <span className="text-xs font-semibold text-muted-foreground">
                  {allResults.length} resultado{allResults.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight truncate">Resultados da Busca</h2>
            <p className="text-sm text-muted-foreground truncate">
              {searchData.search_query || `${searchData.category} em ${searchData.city}, ${searchData.state}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={refreshResults} size="sm" variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
            {allResults.length > 0 && (
              <Button onClick={enrichAll} size="sm" variant="outline" disabled={enriching}>
                {enriching ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {enriching ? "Enriquecendo..." : `Enriquecer todos (${allResults.filter((r: any) => !r.enriched_at).length})`}
              </Button>
            )}
            {allResults.length > 0 && hasMore && (
              <Button
                onClick={loadMoreResults}
                size="sm"
                disabled={loading || isFetchingBatch}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isFetchingBatch ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Capturar mais 100
              </Button>
            )}
            {allResults.length > 0 && (
              <Button onClick={exportToCSV} size="sm" className="btn-volt">
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
            )}
          </div>
        </div>
        {searchData.warning && (
          <div className="mt-4 bg-warning/10 border border-warning/30 text-warning-foreground rounded-xl p-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold">Aviso sobre estes resultados</p>
              <p className="opacity-90 mt-1">{searchData.warning}</p>
            </div>
          </div>
        )}

        {(isFetchingBatch || planLimit) && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2 mb-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                {isFetchingBatch ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>Capturando lote #{batchNumber} (até 100 novos leads)...</span>
                  </>
                ) : (
                  <span>Progresso de captura</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {allResults.length}
                {planLimit ? ` / ${planLimit}` : ""} leads
              </span>
            </div>
            <Progress
              value={planLimit ? Math.min(100, (allResults.length / planLimit) * 100) : (isFetchingBatch ? 30 : 100)}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {isFetchingBatch
                ? "Buscando novos resultados — isso pode levar alguns segundos."
                : hasMore
                  ? "Clique em \"Carregar mais\" para capturar os próximos 100 leads (sem repetir)."
                  : planLimit && allResults.length >= planLimit
                    ? "Limite do seu plano atingido."
                    : "Não há mais resultados disponíveis para esta busca."}
            </p>
          </div>
        )}
      </div>

      <ResultsList
        results={allResults}
        isLoading={isLoading}
        hasMore={hasMore}
        onLoadMore={loadMoreResults}
      />
    </section>
  );
};