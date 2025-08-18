import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download } from "lucide-react";
import { ResultsList } from "./ResultsList";

interface ResultsSectionProps {
  searchData: any;
}

export const ResultsSection = ({ searchData }: ResultsSectionProps) => {
  const [allResults, setAllResults] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const resultsPerPage = 50;

  useEffect(() => {
    if (searchData?.id) {
      fetchResults();
      setCurrentPage(1); // Reset to first page on new search
    }
  }, [searchData?.id]);

  const fetchResults = async () => {
    if (!searchData?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('search_results')
        .select('*')
        .eq('search_id', searchData.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllResults(data || []);
    } catch (error) {
      console.error('Error fetching results:', error);
    } finally {
      setLoading(false);
    }
  };

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

  // Calcular dados para paginação
  const totalPages = Math.ceil(allResults.length / resultsPerPage);
  const startIndex = (currentPage - 1) * resultsPerPage;
  const endIndex = startIndex + resultsPerPage;
  const currentResults = allResults.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top of results
    document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (!searchData) return null;

  const searchStatus = searchData.status || 'pending';
  const isLoading = loading || searchStatus === 'pending' || searchStatus === 'processing';

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
              <Button onClick={fetchResults} size="sm" variant="outline">
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
          </div>

          <ResultsList
            results={currentResults}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            isLoading={isLoading}
          />
        </div>
      </div>
    </section>
  );
};