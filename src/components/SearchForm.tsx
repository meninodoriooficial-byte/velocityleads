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
  }) => void | Promise<void>;
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
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

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

  useEffect(() => {
    setNeighborhood("");
    setNeighborhoods([]);
    if (!city || !selectedState) return;

    setLoadingNeighborhoods(true);
    const query = `
[out:json][timeout:25];
area["name"="${city}"]["admin_level"~"8|9"]->.searchArea;
(
  node["place"~"suburb|neighbourhood|quarter"](area.searchArea);
  way["place"~"suburb|neighbourhood|quarter"](area.searchArea);
  relation["place"~"suburb|neighbourhood|quarter"](area.searchArea);
);
out tags;`;

    fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: query,
    })
      .then((r) => r.json())
      .then((data: any) => {
        const names = Array.from(
          new Set(
            (data?.elements || [])
              .map((el: any) => el?.tags?.name)
              .filter((n: any): n is string => typeof n === "string" && n.trim().length > 0)
          )
        ).sort((a, b) => (a as string).localeCompare(b as string, "pt-BR"));
        setNeighborhoods(names as string[]);
      })
      .catch((err) => {
        console.error("Erro ao carregar bairros (Overpass):", err);
        setNeighborhoods([]);
      })
      .finally(() => setLoadingNeighborhoods(false));
  }, [city, selectedState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !selectedState || !city) return;
    setIsSearching(true);
    try {
      await onSearch({ category, state: selectedState, city, neighborhood: neighborhood || undefined });
    } finally {
      // Mantém a animação por um instante para feedback visual mesmo em buscas rápidas
      setTimeout(() => setIsSearching(false), 600);
    }
  };
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
                    <Select
                      value={neighborhood || "__all__"}
                      onValueChange={(v) => setNeighborhood(v === "__all__" ? "" : v)}
                      disabled={!city || loadingNeighborhoods}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            !city
                              ? "Selecione a cidade"
                              : loadingNeighborhoods
                              ? "Carregando bairros..."
                              : neighborhoods.length === 0
                              ? "Nenhum bairro encontrado"
                              : "Todos os bairros"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="__all__">Todos os bairros</SelectItem>
                        {neighborhoods.map((n) => (
                          <SelectItem key={n} value={n}>
                            {n}
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
                    disabled={!category || !selectedState || !city || isSearching}
                  >
                    {isSearching ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Buscando...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5 mr-2" />
                        Buscar Empresas
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {isSearching && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in"
          role="status"
          aria-live="polite"
        >
          <div className="bg-card border rounded-2xl shadow-2xl p-8 max-w-sm w-[90%] text-center animate-scale-in">
            <div className="relative w-24 h-24 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-primary/20 animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Search className="w-10 h-10 text-primary animate-pulse" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-1">Buscando empresas...</h3>
            <p className="text-sm text-muted-foreground">
              {category} em {city}
              {neighborhood ? ` • ${neighborhood}` : ""}
            </p>
            <div className="mt-4 flex justify-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}

      {selectedSearch && (
        <ResultsSection searchData={selectedSearch} />
      )}
    </div>
  );
};
