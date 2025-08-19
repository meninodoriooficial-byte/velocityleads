import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Mail, Globe, Star, Users, ChevronDown, ChevronUp, Building, User, Clock, Instagram, Facebook } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ResultsListProps {
  results: any[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export const ResultsList = ({ results, isLoading, hasMore, onLoadMore }: ResultsListProps) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  // Infinite scroll effect
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 1000) {
        if (!isLoading && hasMore) {
          onLoadMore();
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore, onLoadMore]);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Buscando empresas...</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Nenhum resultado encontrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Lista de resultados */}
      <div className="space-y-3">
        {results.map((result: any) => {
          const isExpanded = expandedItems.has(result.id);
          
          return (
            <Card key={result.id} className="border border-border/50 hover:border-border transition-colors">
              <Collapsible>
                <CollapsibleTrigger 
                  className="w-full"
                  onClick={() => toggleExpanded(result.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="flex-1 text-left">
                          <CardTitle className="text-lg mb-1">{result.business_name}</CardTitle>
                          <div className="flex items-center space-x-2 mb-2">
                            <Badge variant="secondary" className="text-xs">{result.business_type}</Badge>
                            {result.rating && (
                              <div className="flex items-center space-x-1">
                                <Star className="w-4 h-4 text-yellow-500 fill-current" />
                                <span className="text-sm text-muted-foreground">{result.rating}</span>
                                {result.reviews_count && (
                                  <span className="text-xs text-muted-foreground">({result.reviews_count})</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <MapPin className="w-4 h-4" />
                            <span className="truncate">{result.address}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Informações de Contato */}
                      <div className="space-y-4">
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          Informações de Contato
                        </h4>
                        <div className="space-y-3 pl-6">
                          {result.phone && (
                            <div className="flex items-center space-x-2">
                              <Phone className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">{result.phone}</span>
                            </div>
                          )}
                          {result.email && (
                            <div className="flex items-center space-x-2">
                              <Mail className="w-4 h-4 text-muted-foreground" />
                              <a href={`mailto:${result.email}`} className="text-sm text-primary hover:underline">
                                {result.email}
                              </a>
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
                          {result.owner_name && (
                            <div className="flex items-center space-x-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">{result.owner_name}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Redes Sociais e Detalhes */}
                      <div className="space-y-4">
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          <Building className="w-4 h-4" />
                          Detalhes do Negócio
                        </h4>
                        <div className="space-y-3 pl-6">
                          {result.additional_data?.hours && (
                            <div className="flex items-center space-x-2">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">{result.additional_data.hours}</span>
                            </div>
                          )}
                          {result.social_media?.instagram && (
                            <div className="flex items-center space-x-2">
                              <Instagram className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">{result.social_media.instagram}</span>
                            </div>
                          )}
                          {result.social_media?.facebook && (
                            <div className="flex items-center space-x-2">
                              <Facebook className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">{result.social_media.facebook}</span>
                            </div>
                          )}
                          {result.additional_data?.price_range && (
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-muted-foreground">Faixa de preço:</span>
                              <Badge variant="outline">{result.additional_data.price_range}</Badge>
                            </div>
                          )}
                          {result.additional_data?.services && result.additional_data.services.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-sm text-muted-foreground">Serviços:</span>
                              <div className="flex flex-wrap gap-1">
                                {result.additional_data.services.map((service: string, index: number) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {service}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Coordenadas para desenvolvedores */}
                    {(result.latitude || result.longitude) && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <span className="text-xs text-muted-foreground">
                          Coordenadas: {result.latitude?.toFixed(6)}, {result.longitude?.toFixed(6)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {/* Carregamento e botão carregar mais */}
      {(isLoading || hasMore) && (
        <div className="text-center py-8">
          {isLoading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="text-muted-foreground">Carregando mais resultados...</span>
            </div>
          ) : hasMore ? (
            <Button onClick={onLoadMore} variant="outline" size="lg">
              Carregar mais resultados
            </Button>
          ) : null}
        </div>
      )}

      {/* Informações dos resultados */}
      <div className="text-center text-sm text-muted-foreground">
        {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
        {!isLoading && !hasMore && results.length > 0 && (
          <span className="block mt-1">Todos os resultados foram carregados</span>
        )}
      </div>
    </div>
  );
};