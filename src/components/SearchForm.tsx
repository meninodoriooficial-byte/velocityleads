import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, MapPin, Building, Loader2 } from "lucide-react";
import { ResultsSection } from "./ResultsSection";
import { MapSearchLoader } from "./MapSearchLoader";

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

const LAST_SEARCH_KEY = "lastSearchLocation";

export const SearchForm = ({ onSearch, selectedSearch }: SearchFormProps) => {
  const [category, setCategory] = useState("");
  const [selectedState, setSelectedState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LAST_SEARCH_KEY) || "{}").state || "SP"; } catch { return "SP"; }
  });
  const [city, setCity] = useState("");
  const [pendingCity, setPendingCity] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem(LAST_SEARCH_KEY) || "{}").city || "São Paulo"; } catch { return "São Paulo"; }
  });
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
    setLoadingCities(true);
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${selectedState}/municipios`)
      .then((r) => r.json())
      .then((data: any[]) => {
        const sorted = (data || [])
          .map((m) => m.nome)
          .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
        // Para SP, colocar "São Paulo" como primeira da lista
        const names =
          selectedState === "SP" && sorted.includes("São Paulo")
            ? ["São Paulo", ...sorted.filter((n: string) => n !== "São Paulo")]
            : sorted;
        setCities(names);
        if (pendingCity && names.includes(pendingCity)) {
          setCity(pendingCity);
        } else if (selectedState === "SP" && names.includes("São Paulo")) {
          setCity("São Paulo");
        } else {
          setCity("");
        }
        setPendingCity("");
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
    const controller = new AbortController();

    const loadNeighborhoods = async () => {
      try {
        // 1) Localizar a área da cidade no OSM via Nominatim (filtra por estado/UF)
        const stateName = states.find((s) => s.code === selectedState)?.name || "";
        const nomUrl =
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&country=Brasil` +
          `&state=${encodeURIComponent(stateName)}&city=${encodeURIComponent(city)}`;

        const nomRes = await fetch(nomUrl, {
          signal: controller.signal,
          headers: { "Accept-Language": "pt-BR" },
        });
        const nomData = await nomRes.json();
        const place = Array.isArray(nomData) ? nomData[0] : null;

        let elements: any[] = [];

        if (place?.osm_id && place?.osm_type) {
          // Nominatim retorna osm_type "relation"|"way"|"node". Para Overpass area: relation -> 3600000000+id, way -> 2400000000+id
          const typeMap: Record<string, number> = { relation: 3600000000, way: 2400000000 };
          const offset = typeMap[place.osm_type];
          if (offset) {
            const areaId = offset + Number(place.osm_id);
            const query = `[out:json][timeout:25];
area(${areaId})->.a;
(
  node["place"~"suburb|neighbourhood|quarter|city_block"](area.a);
  way["place"~"suburb|neighbourhood|quarter|city_block"](area.a);
  relation["place"~"suburb|neighbourhood|quarter|city_block"](area.a);
  relation["boundary"="administrative"]["admin_level"~"10|11"](area.a);
);
out tags;`;
            const ovRes = await fetch("https://overpass-api.de/api/interpreter", {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: query,
              signal: controller.signal,
            });
            const ovData = await ovRes.json();
            elements = ovData?.elements || [];
          }
        }

        // Fallback: query por nome se nada veio
        if (elements.length === 0) {
          const fallback = `[out:json][timeout:25];
area["name"="${city}"]["admin_level"~"8|9|10"]->.a;
(
  node["place"~"suburb|neighbourhood|quarter"](area.a);
  way["place"~"suburb|neighbourhood|quarter"](area.a);
  relation["place"~"suburb|neighbourhood|quarter"](area.a);
);
out tags;`;
          const fbRes = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: fallback,
            signal: controller.signal,
          });
          const fbData = await fbRes.json();
          elements = fbData?.elements || [];
        }

        const names = Array.from(
          new Set(
            elements
              .map((el: any) => el?.tags?.name)
              .filter((n: any): n is string => typeof n === "string" && n.trim().length > 0)
          )
        ).sort((a, b) => (a as string).localeCompare(b as string, "pt-BR"));

        console.log(`[Bairros] ${city}/${selectedState}: ${names.length} encontrados`);
        setNeighborhoods(names as string[]);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Erro ao carregar bairros:", err);
          setNeighborhoods([]);
        }
      } finally {
        setLoadingNeighborhoods(false);
      }
    };

    loadNeighborhoods();
    return () => controller.abort();
  }, [city, selectedState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !selectedState || !city) return;
    try {
      localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify({ state: selectedState, city }));
    } catch {}
    setIsSearching(true);
    try {
      await onSearch({ category, state: selectedState, city, neighborhood: neighborhood || undefined });
    } finally {
      // Mantém a animação por um instante para feedback visual mesmo em buscas rápidas
      setTimeout(() => setIsSearching(false), 600);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="card-elevated overflow-hidden border-border/60">
        <CardHeader className="bg-gradient-to-b from-card to-secondary/30 border-b border-border/60 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="size-10 bg-accent rounded-full flex items-center justify-center text-accent-foreground font-bold shrink-0">
              <Search className="size-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Definir parâmetros da prospecção</CardTitle>
              <p className="text-sm text-muted-foreground font-medium mt-0.5">
                Configure seu alvo para gerar uma nova lista de leads enriquecidos.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  <div className="space-y-2">
                    <label className="text-sm font-bold flex items-center gap-2">
                      <Building className="w-4 h-4 text-muted-foreground" />
                      Ramo de Atividade <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="Ex: Petshop, Dentista..."
                      className="h-12 bg-secondary/40 border-2 border-transparent hover:border-border focus-visible:bg-card focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-secondary rounded-xl font-medium px-4"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      Estado <span className="text-destructive">*</span>
                    </label>
                    <Select value={selectedState} onValueChange={setSelectedState}>
                      <SelectTrigger className="h-12 bg-secondary/40 border-2 border-transparent hover:border-border focus:bg-card focus:border-primary rounded-xl font-medium px-4">
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
                    <label className="text-sm font-bold flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      Cidade <span className="text-destructive">*</span>
                    </label>
                    <Select value={city} onValueChange={setCity} disabled={!selectedState || loadingCities}>
                      <SelectTrigger className="h-12 bg-secondary/40 border-2 border-transparent hover:border-border focus:bg-card focus:border-primary rounded-xl font-medium px-4">
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
                    <label className="text-sm font-bold flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      Bairro (Opcional)
                    </label>
                    <Select
                      value={neighborhood || "__all__"}
                      onValueChange={(v) => setNeighborhood(v === "__all__" ? "" : v)}
                      disabled={!city || loadingNeighborhoods}
                    >
                      <SelectTrigger className="h-12 bg-secondary/40 border-2 border-transparent hover:border-border focus:bg-card focus:border-primary rounded-xl font-medium px-4">
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

                <div className="flex justify-end pt-4 border-t border-border/60">
                  <Button
                    type="submit"
                    size="lg"
                    className="btn-volt min-w-[240px] h-14 text-base rounded-xl active:scale-[0.98]"
                    disabled={!category || !selectedState || !city || isSearching}
                  >
                    {isSearching ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Buscando...
                      </>
                    ) : (
                      <>
                        Acelerar Extração
                        <span className="text-xl">→</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
        </CardContent>
      </Card>

      {isSearching && (
        <MapSearchLoader
          category={category}
          city={city}
          state={selectedState}
          neighborhood={neighborhood}
        />
      )}

      {selectedSearch && (
        <ResultsSection searchData={selectedSearch} />
      )}
    </div>
  );
};
