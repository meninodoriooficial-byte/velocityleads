import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Instagram, Facebook, MapPin, Sparkles, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ResultsListProps {
  results: any[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

const instagramUrl = (handle: string) => {
  if (!handle) return "#";
  if (/^https?:\/\//i.test(handle)) return handle;
  const username = handle.replace(/^@/, "").trim();
  return `https://instagram.com/${encodeURIComponent(username)}`;
};

const facebookUrl = (value: string) => {
  if (!value) return "#";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://www.facebook.com/${encodeURIComponent(value.trim())}`;
};

export const ResultsList = ({ results, isLoading, hasMore, onLoadMore }: ResultsListProps) => {
  const { toast } = useToast();
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [enrichedMap, setEnrichedMap] = useState<Record<string, any>>({});
  const [openDialog, setOpenDialog] = useState<string | null>(null);

  const handleEnrich = async (r: any) => {
    setEnrichingId(r.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        const exp = sessionData.session.expires_at ?? 0;
        const now = Math.floor(Date.now() / 1000);
        if (exp - now < 60) await supabase.auth.refreshSession();
      }

      const { data, error } = await supabase.functions.invoke("enrich-lead", {
        body: { resultId: r.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const enriched = (data as any).enriched_data;
      setEnrichedMap((prev) => ({ ...prev, [r.id]: { data: enriched, source: (data as any).source } }));
      setOpenDialog(r.id);
      toast({ title: "Dados enriquecidos", description: `Fonte: ${(data as any).source}` });
    } catch (e: any) {
      toast({ title: "Falha ao enriquecer", description: e?.message || "Tente novamente", variant: "destructive" });
    } finally {
      setEnrichingId(null);
    }
  };

  const getEnriched = (r: any) =>
    enrichedMap[r.id] || (r.enriched_data && Object.keys(r.enriched_data || {}).length
      ? { data: r.enriched_data, source: r.enriched_source }
      : null);

  // Infinite scroll
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
      <div className="border rounded-md overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Empresa</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="min-w-[220px]">Endereço</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Instagram</TableHead>
              <TableHead>Facebook</TableHead>
              <TableHead>Avaliação</TableHead>
              <TableHead>Mapa</TableHead>
              <TableHead>Fonte</TableHead>
              <TableHead>Enriquecer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.business_name}</TableCell>
                <TableCell>
                  {r.business_type ? (
                    <Badge variant="secondary" className="text-xs">{r.business_type}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{r.address || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {r.phone ? (
                    <a href={`tel:${r.phone}`} className="text-primary hover:underline">{r.phone}</a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {r.email ? (
                    <a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm max-w-[180px] truncate">
                  {r.website ? (
                    <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {r.website}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.social_media?.instagram ? (
                    <a
                      href={instagramUrl(r.social_media.instagram)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                    >
                      <Instagram className="w-3 h-3" />
                      {r.social_media.instagram}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.social_media?.facebook ? (
                    <a
                      href={facebookUrl(r.social_media.facebook)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                    >
                      <Facebook className="w-3 h-3" />
                      {r.social_media.facebook}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {r.rating ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-500 fill-current" />
                      {r.rating}
                      {r.reviews_count ? <span className="text-muted-foreground">({r.reviews_count})</span> : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.additional_data?.google_url ? (
                    <a
                      href={r.additional_data.google_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                    >
                      <MapPin className="w-3 h-3" />
                      Abrir
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{r.source_api ?? "—"}</Badge>
                </TableCell>
                <TableCell>
                  {(() => {
                    const enr = getEnriched(r);
                    if (enr) {
                      return (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setOpenDialog(r.id)}
                          className="text-xs"
                        >
                          <Sparkles className="w-3 h-3 mr-1" />
                          Ver dados
                        </Button>
                      );
                    }
                    return (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleEnrich(r)}
                        disabled={enrichingId === r.id}
                        className="text-xs"
                      >
                        {enrichingId === r.id ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Buscando...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 mr-1" />
                            Enriquecer
                          </>
                        )}
                      </Button>
                    );
                  })()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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

      <Dialog open={!!openDialog} onOpenChange={(o) => !o && setOpenDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dados Enriquecidos</DialogTitle>
            <DialogDescription>
              {(() => {
                const r = results.find((x: any) => x.id === openDialog);
                const enr = r ? getEnriched(r) : null;
                return r ? `${r.business_name} • Fonte: ${enr?.source || "—"}` : "";
              })()}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const r = results.find((x: any) => x.id === openDialog);
            const enr = r ? getEnriched(r) : null;
            if (!enr) return null;
            const cdd = enr.data?.casadosdados;
            const ai = enr.data?.ai;
            return (
              <div className="space-y-4 text-sm">
                {cdd && (
                  <div className="border rounded-md p-3 bg-muted/30">
                    <h4 className="font-semibold mb-2">Casa dos Dados (CNPJ)</h4>
                    <dl className="grid grid-cols-2 gap-2">
                      {cdd.cnpj && <><dt className="text-muted-foreground">CNPJ</dt><dd>{cdd.cnpj}</dd></>}
                      {cdd.razao_social && <><dt className="text-muted-foreground">Razão Social</dt><dd>{cdd.razao_social}</dd></>}
                      {cdd.nome_fantasia && <><dt className="text-muted-foreground">Nome Fantasia</dt><dd>{cdd.nome_fantasia}</dd></>}
                      {cdd.atividade_principal && <><dt className="text-muted-foreground">Atividade</dt><dd>{typeof cdd.atividade_principal === "string" ? cdd.atividade_principal : JSON.stringify(cdd.atividade_principal)}</dd></>}
                      {cdd.porte && <><dt className="text-muted-foreground">Porte</dt><dd>{cdd.porte}</dd></>}
                      {cdd.capital_social && <><dt className="text-muted-foreground">Capital Social</dt><dd>{cdd.capital_social}</dd></>}
                      {cdd.data_abertura && <><dt className="text-muted-foreground">Abertura</dt><dd>{cdd.data_abertura}</dd></>}
                    </dl>
                  </div>
                )}
                {ai && (
                  <div className="border rounded-md p-3 bg-muted/30">
                    <h4 className="font-semibold mb-2">Insights IA</h4>
                    <dl className="space-y-2">
                      {ai.descricao && <div><dt className="text-muted-foreground">Descrição</dt><dd>{ai.descricao}</dd></div>}
                      {ai.segmento && <div><dt className="text-muted-foreground">Segmento</dt><dd>{ai.segmento}</dd></div>}
                      {ai.porte_estimado && <div><dt className="text-muted-foreground">Porte estimado</dt><dd>{ai.porte_estimado}</dd></div>}
                      {ai.publico_alvo && <div><dt className="text-muted-foreground">Público-alvo</dt><dd>{ai.publico_alvo}</dd></div>}
                      {Array.isArray(ai.produtos_servicos) && ai.produtos_servicos.length > 0 && (
                        <div><dt className="text-muted-foreground">Produtos/Serviços</dt><dd>{ai.produtos_servicos.join(", ")}</dd></div>
                      )}
                      {Array.isArray(ai.diferenciais) && ai.diferenciais.length > 0 && (
                        <div><dt className="text-muted-foreground">Diferenciais</dt><dd>{ai.diferenciais.join(", ")}</dd></div>
                      )}
                      {ai.pitch_abordagem && <div><dt className="text-muted-foreground">Pitch sugerido</dt><dd className="italic">{ai.pitch_abordagem}</dd></div>}
                    </dl>
                  </div>
                )}
                {!cdd && !ai && (
                  <p className="text-muted-foreground">Nenhum dado adicional encontrado.</p>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};