import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, AlertTriangle } from "lucide-react";
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

  useEffect(() => {
    if (searchData?.id) {
      setAllResults([]);
      setCurrentPage(1);
      setHasMore(true);
      fetchResults(true);
    }
  }, [searchData?.id]);

  const fetchResults = async (isNewSearch = false) => {
    if (!searchData?.id) return;
    
    setLoading(true);
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
          setHasMore(false); // Se já tem resultados, não tem mais para carregar
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

      if (isNewSearch) {
        setAllResults(newResults || []);
      } else {
        // Adicionar apenas os novos resultados (evitar duplicatas)
        const existingIds = new Set(allResults.map((r: any) => r.id));
        const uniqueNewResults = (newResults || []).filter((r: any) => !existingIds.has(r.id));
        setAllResults(prev => [...prev, ...uniqueNewResults]);
      }

      // Paginação é feita no cliente (10 por página) sobre os resultados desta busca
      setHasMore(false);
      
    } catch (error) {
      console.error('Error fetching results:', error);
      setHasMore(false);
    } finally {
      setLoading(false);
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