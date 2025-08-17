import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { SearchForm } from "@/components/SearchForm";
import { ResultsSection } from "@/components/ResultsSection";
import { Button } from "@/components/ui/button";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchData, setSearchData] = useState<{
    category: string;
    state: string;
    city: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  const handleSearch = (data: { category: string; state: string; city: string }) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setSearchData(data);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      
      {/* Call to Action */}
      {!user && (
        <section className="py-16 bg-secondary/30">
          <div className="container mx-auto px-6 text-center">
            <div className="max-w-2xl mx-auto">
              <h3 className="text-2xl font-semibold mb-4">
                Comece a buscar empresas agora!
              </h3>
              <p className="text-muted-foreground mb-6">
                Faça login ou crie uma conta para começar a usar nossa plataforma de busca empresarial.
              </p>
              <Button size="lg" onClick={() => navigate("/auth")}>
                Começar Agora
              </Button>
            </div>
          </div>
        </section>
      )}
      
      <SearchForm onSearch={handleSearch} />
      <ResultsSection searchData={searchData} />
    </div>
  );
};

export default Index;