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
    <section id="results-section" className="py-16 bg-secondary/10">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Resultados da Busca</h2>
            <p className="text-lg text-muted-foreground mb-4">
              {searchData.search_query || `${searchData.category} em ${searchData.city}, ${searchData.state}`}
            </p>
            <div className="flex items-center justify-center space-x-4">
              <Badge variant={searchStatus === 'completed' ? 'default' : 'secondary'}>
                {searchStatus === 'completed' ? 'Concluída' : 'Processando...'}
              </Badge>
              <Button onClick={refreshResults} size="sm" variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar
              </Button>
              {allResults.length > 0 && (
                <Button onClick={exportToCSV} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Exportar CSV
                </Button>
              )}
            </div>
            {allResults.length > 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Total de {allResults.length} resultado{allResults.length !== 1 ? 's' : ''} encontrado{allResults.length !== 1 ? 's' : ''}
              </p>
            )}
            {searchData.warning && (
              <div className="mt-4 mx-auto max-w-2xl text-left bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400 rounded-md p-3 flex items-start gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Aviso sobre estes resultados</p>
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
        </div>
      </div>
    </section>
  );
};