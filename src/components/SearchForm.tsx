import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, MapPin, Building } from "lucide-react";
import { useCitiesByState } from "@/hooks/useCitiesByState";
import { useNeighborhoodsByCity } from "@/hooks/useNeighborhoodsByCity";

interface SearchFormProps {
  onSearch: (data: {
    category: string;
    state: string;
    city: string;
    neighborhood?: string;
  }) => void;
}

export const SearchForm = ({ onSearch }: SearchFormProps) => {
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const { selectedState, availableCities, updateState } = useCitiesByState();
  const { selectedCity, availableNeighborhoods, updateCity } = useNeighborhoodsByCity();

  const categories = [
    "Petshop",
    "Médico",
    "Dentista",
    "Farmácia",
    "Restaurante",
    "Academia",
    "Salão de Beleza",
    "Oficina Mecânica",
    "Loja de Roupas",
    "Supermercado"
  ];

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

  const handleStateChange = (stateCode: string) => {
    updateState(stateCode);
    setCity("");
    setNeighborhood("");
  };

  const handleCityChange = (cityName: string) => {
    setCity(cityName);
    updateCity(cityName);
    setNeighborhood("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (category && selectedState && city) {
      const finalNeighborhood = neighborhood === "all" ? "" : neighborhood;
      onSearch({ category, state: selectedState, city, neighborhood: finalNeighborhood });
    }
  };

  return (
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
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat.toLowerCase()}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Estado
                  </label>
                  <Select value={selectedState} onValueChange={handleStateChange}>
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
                  <Select value={city} onValueChange={handleCityChange} disabled={!selectedState}>
                    <SelectTrigger>
                      <SelectValue placeholder={selectedState ? "Selecione a cidade" : "Primeiro selecione o estado"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCities.map((cityOption) => (
                        <SelectItem key={cityOption.id} value={cityOption.name}>
                          {cityOption.name}
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
                  <Select value={neighborhood} onValueChange={setNeighborhood} disabled={!city}>
                    <SelectTrigger>
                      <SelectValue placeholder={city ? "Selecione o bairro" : "Primeiro selecione a cidade"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os bairros</SelectItem>
                      {availableNeighborhoods.map((neighborhoodOption) => (
                        <SelectItem key={neighborhoodOption.id} value={neighborhoodOption.name}>
                          {neighborhoodOption.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
  );
};