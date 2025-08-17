import { useState } from "react";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { SearchForm } from "@/components/SearchForm";
import { ResultsSection } from "@/components/ResultsSection";

const Index = () => {
  const [searchData, setSearchData] = useState<{
    category: string;
    state: string;
    city: string;
  } | null>(null);

  const handleSearch = (data: { category: string; state: string; city: string }) => {
    setSearchData(data);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      <SearchForm onSearch={handleSearch} />
      <ResultsSection searchData={searchData} />
      
      {/* Backend Integration Notice */}
      {searchData && (
        <section className="py-16 bg-secondary/30">
          <div className="container mx-auto px-6 text-center">
            <div className="max-w-2xl mx-auto">
              <h3 className="text-xl font-semibold mb-4">
                🚀 Conecte ao Supabase para Funcionalidade Completa
              </h3>
              <p className="text-muted-foreground mb-6">
                Para buscar empresas reais no Google Maps e salvar resultados, 
                conecte seu projeto ao Supabase usando nossa integração nativa.
              </p>
              <div className="bg-card p-6 rounded-lg border">
                <h4 className="font-medium mb-2">Funcionalidades disponíveis com Supabase:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Integração com Google Maps API</li>
                  <li>• Sistema de autenticação de usuários</li>
                  <li>• Salvamento de buscas e resultados</li>
                  <li>• Dashboard personalizado</li>
                  <li>• Sistema de planos e assinatura</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Index;