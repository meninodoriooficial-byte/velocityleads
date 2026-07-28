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
  const [cityIdMap, setCityIdMap] = useState<Record<string, number>>({});
  const cityIbgeId = city ? cityIdMap[city] : undefined;
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
        // Guarda o mapa nome -> id do IBGE (usado como fallback de bairros)
        const idMap: Record<string, number> = {};
        (data || []).forEach((m: any) => {
          if (m?.nome && m?.id) idMap[m.nome] = m.id;
        });
        setCityIdMap(idMap);
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
      // Cache local por 7 dias para evitar refazer a query lenta do Overpass
      const cacheKey = `nb2:${selectedState}:${city}`;
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const { at, names } = JSON.parse(raw);
          if (Date.now() - at < 7 * 24 * 60 * 60 * 1000 && Array.isArray(names) && names.length > 0) {
            setNeighborhoods(names);
            setLoadingNeighborhoods(false);
            return;
          }
        }
      } catch {}

      // Query Overpass robusta: timeout maior, busca a área do município de
      // forma tolerante (com e sem admin_level), e inclui nós, ways e relations
      // de todos os tipos de bairro/subdivisão para trazer a lista completa.
      const esc = city.replace(/"/g, '\\"');
      const query = `[out:json][timeout:60];
area["ISO3166-2"="BR-${selectedState}"]->.st;
(
  area["name"="${esc}"]["admin_level"~"^(8|9|10)$"](area.st);
  area["name"="${esc}"]["boundary"="administrative"](area.st);
)->.a;
(
  node["place"~"suburb|neighbourhood|quarter|city_block|borough|hamlet"](area.a);
  way["place"~"suburb|neighbourhood|quarter|city_block|borough"](area.a);
  relation["place"~"suburb|neighbourhood|quarter|borough"](area.a);
  relation["boundary"="administrative"]["admin_level"~"^(10|11)$"](area.a);
);
out tags;`;

      const endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
      ];

      const fetchOne = (url: string) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "data=" + encodeURIComponent(query),
          signal: controller.signal,
        }).then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          return (data?.elements || []) as any[];
        });

      // Fallback: distritos oficiais do IBGE (sempre disponível, nunca vazio
      // para municípios com subdivisão). Não são "bairros" exatos, mas cobrem
      // quando o Overpass falha ou está incompleto.
      const loadIbgeDistricts = async (): Promise<string[]> => {
        try {
          const cityId = cityIbgeId;
          if (!cityId) return [];
          const r = await fetch(
            `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${cityId}/distritos`,
            { signal: controller.signal }
          );
          const d = await r.json();
          return (Array.isArray(d) ? d : []).map((x: any) => x?.nome).filter(Boolean);
        } catch {
          return [];
        }
      };

      try {
        // Corre os 3 endpoints do Overpass em paralelo; usa o primeiro que trouxer
        // resultado não-vazio. Se todos falharem/vazios, cai no IBGE.
        const overpassNames = await new Promise<string[]>((resolve) => {
          let pending = endpoints.length;
          let settled = false;
          const finish = (names: string[]) => {
            if (settled) return;
            settled = true;
            resolve(names);
          };
          endpoints.map(fetchOne).forEach((p) => {
            p.then((els) => {
              const names = Array.from(
                new Set(
                  els
                    .map((el: any) => el?.tags?.name)
                    .filter((n: any): n is string => typeof n === "string" && n.trim().length > 0)
                )
              );
              if (names.length > 0) finish(names);
              else if (--pending === 0) finish([]);
            }).catch(() => {
              if (--pending === 0) finish([]);
            });
          });
        });

        let names = overpassNames;
        if (names.length === 0) {
          // Overpass não retornou nada — usa distritos do IBGE
          names = await loadIbgeDistricts();
        }

        names = Array.from(new Set(names)).sort((a, b) =>
          a.localeCompare(b, "pt-BR")
        );

        console.log(`[Bairros] ${city}/${selectedState}: ${names.length} encontrados`);
        setNeighborhoods(names);
        if (names.length > 0) {
          try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), names })); } catch {}
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Erro ao carregar bairros:", err);
          // Última tentativa: IBGE
          const fallback = await loadIbgeDistricts();
          setNeighborhoods(
            Array.from(new Set(fallback)).sort((a, b) => a.localeCompare(b, "pt-BR"))
          );
        }
      } finally {
        setLoadingNeighborhoods(false);
      }
    };

    loadNeighborhoods();
    return () => controller.abort();
  }, [city, selectedState, cityIbgeId]);

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
                      disabled={!city}
                    >
                      <SelectTrigger className="h-12 bg-secondary/40 border-2 border-transparent hover:border-border focus:bg-card focus:border-primary rounded-xl font-medium px-4">
                        <SelectValue
                          placeholder={
                            !city ? "Selecione a cidade" : "Todos os bairros"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="__all__">
                          Todos os bairros{neighborhoods.length > 0 ? ` (${neighborhoods.length})` : ""}
                        </SelectItem>
                        {loadingNeighborhoods && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Carregando bairros...
                          </div>
                        )}
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
