import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, MapPin, Building, Loader2 } from "lucide-react";
import { ResultsSection } from "./ResultsSection";

interface SearchFormProps {
  onSearch: (data: {
    category: string;
    state: string;
    city: string;
    neighborhood?: string;
  }) => void;
  selectedSearch?: any;
}

const states = [
  { code: "AC", name: "Acre" },
  { code: "AL", name: "Alagoas" },
  { code: "AP", name: "Amapá" },
  { code: "AM", name: "Amazonas" },
  { code: "BA", name: "Bahia" },
  { code: "CE", name: "Ceará" },
  { code: "DF", name: "Distrito Federal" },
  { code: "ES", name: "Espírito Santo" },
  { code: "GO", name: "Goiás" },
  { code: "MA", name: "Maranhão" },
  { code: "MT", name: "Mato Grosso" },
  { code: "MS", name: "Mato Grosso do Sul" },
  { code: "MG", name: "Minas Gerais" },
  { code: "PA", name: "Pará" },
  { code: "PB", name: "Paraíba" },
  { code: "PR", name: "Paraná" },
  { code: "PE", name: "Pernambuco" },
  { code: "PI", name: "Piauí" },
  { code: "RJ", name: "Rio de Janeiro" },
  { code: "RN", name: "Rio Grande do Norte" },
  { code: "RS", name: "Rio Grande do Sul" },
  { code: "RO", name: "Rondônia" },
  { code: "RR", name: "Roraima" },
  { code: "SC", name: "Santa Catarina" },
  { code: "SP", name: "São Paulo" },
  { code: "SE", name: "Sergipe" },
  { code: "TO", name: "Tocantins" }
];

export const SearchForm = ({ onSearch, selectedSearch }: SearchFormProps) => {
  const [category, setCategory] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
    if (!selectedState) {
      setCities([]);
      setCity("");
      return;
    }
    setCity("");
    setLoadingCities(true);
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${selectedState}/municipios`)
      .then((r) => r.json())
      .then((data: any[]) => {
        const names = (data || []).map((m) => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        setCities(names);
      })
      .catch((err) => {
        console.error('Erro ao carregar cidades do IBGE:', err);
        setCities([]);
      })
      .finally(() => setLoadingCities(false));
  }, [selectedState]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (category && selectedState && city) {
      onSearch({ category, state: selectedState, city, neighborhood: neighborhood || undefined });
    }
  };

  return (
    <div className="space-y-6">
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <Card className="max-w-4xl mx-auto shadow-lg border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-semibold flex items-center justify-center gap-2">
                <Search className="w-6 h-6 text-primary" />
                Buscar Empresas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Building className="w-4 h-4" />
                      Ramo de Atividade
                    </label>
                    <Input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="Ex: Petshop, Dentista..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Estado
                    </label>
                    <Select value={selectedState} onValueChange={setSelectedState}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {states.map((state) => (
                          <SelectItem key={state.code} value={state.code}>
                            {state.name} ({state.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Cidade
                    </label>
                    <Select value={city} onValueChange={setCity} disabled={!selectedState || loadingCities}>
                      <SelectTrigger>
                        <SelectValue placeholder={
                          !selectedState
                            ? "Selecione o estado"
                            : loadingCities
                            ? "Carregando cidades..."
                            : "Selecione a cidade"
                        } />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {cities.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Bairro (Opcional)
                    </label>
                    <Input
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Digite o bairro"
                      disabled={!city}
                    />
                  </div>
                </div>

                <div className="text-center">
                  <Button 
                    type="submit" 
                    size="lg" 
                    className="min-w-[200px]"
                    disabled={!category || !selectedState || !city}
                  >
                    <Search className="w-5 h-5 mr-2" />
                    Buscar Empresas
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
      
      {selectedSearch && (
        <ResultsSection searchData={selectedSearch} />
      )}
    </div>
  );
};
