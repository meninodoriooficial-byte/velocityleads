import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Mail, Globe, Star, Users, Download, RefreshCw } from "lucide-react";

interface ResultsSectionProps {
  searchData: any;
}

export const ResultsSection = ({ searchData }: ResultsSectionProps) => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchData?.id) {
      fetchResults();
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
      setResults(data || []);
    } catch (error) {
      console.error('Error fetching results:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!searchData) return null;

  const searchStatus = searchData.status || 'pending';
  const isLoading = loading || searchStatus === 'pending' || searchStatus === 'processing';

  return (
    <section className="py-16 bg-secondary/10">
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
            </div>
          </div>

          {isLoading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Buscando empresas...</p>
            </div>
          )}

          {!isLoading && results.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhum resultado encontrado ainda.</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((result: any) => (
                <Card key={result.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg mb-2">{result.business_name}</CardTitle>
                    <Badge variant="secondary">{result.business_type}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {result.address && (
                      <div className="flex items-start space-x-2">
                        <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <span className="text-sm">{result.address}</span>
                      </div>
                    )}
                    {result.phone && (
                      <div className="flex items-center space-x-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{result.phone}</span>
                      </div>
                    )}
                    {result.email && (
                      <div className="flex items-center space-x-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{result.email}</span>
                      </div>
                    )}
                    {result.website && (
                      <div className="flex items-center space-x-2">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <a href={result.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                          {result.website}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};