import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Star,
  Instagram,
  Facebook,
  MapPin,
  Sparkles,
  Loader2,
  Phone,
  Mail,
  Globe,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { ChevronDown, LayoutList, Rows3 } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown } from "lucide-react";
import { LeadCardSkeleton } from "./LeadCardSkeleton";

interface ResultsListProps {
  results: any[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

const instagramUrl = (handle: string) => {
  if (!handle) return "#";
  if (/^https?:\/\//i.test(handle)) return handle;
  return `https://instagram.com/${encodeURIComponent(handle.replace(/^@/, "").trim())}`;
};

const facebookUrl = (value: string) => {
  if (!value) return "#";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://www.facebook.com/${encodeURIComponent(value.trim())}`;
};

const formatCnpjStr = (raw: any): string | null => {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, "");
  if (d.length !== 14) return String(raw);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

const getOverlay = (r: any, enr: any) => {
  const data = enr?.data || {};
  const cdd = data.casadosdados || {};
  const brasil = data.brasilapi || {};
  const ai = data.ai || {};
  const scraped = data.scraped || {};
  const cnpj = formatCnpjStr(cdd.cnpj || brasil.cnpj || ai.cnpj);
  const situacaoRaw =
    brasil.descricao_situacao_cadastral ||
    brasil.situacao_cadastral ||
    cdd.situacao_cadastral ||
    cdd.situacao ||
    ai.situacao_cadastral ||
    ai.situacao ||
    null;
  let status: { label: string; active: boolean } | null = null;
  if (cnpj && situacaoRaw) {
    const s = String(situacaoRaw).trim();
    const active = /ativ/i.test(s);
    status = { label: s, active };
  }
  const email =
    r.email ||
    cdd.email ||
    brasil.email ||
    scraped.emails?.[0] ||
    (Array.isArray(ai.emails) ? ai.emails[0] : ai.email) ||
    null;
  const phone =
    r.phone ||
    cdd.telefone ||
    brasil.telefone ||
    brasil.ddd_telefone_1 ||
    scraped.phones?.[0] ||
    (Array.isArray(ai.telefones) ? ai.telefones[0] : ai.telefone) ||
    null;
  const website = r.website || cdd.website || ai.site || ai.website || null;
  const sociosRaw: any[] = [
    ...(Array.isArray(brasil.qsa) ? brasil.qsa : []),
    ...(Array.isArray(brasil.socios) ? brasil.socios : []),
    ...(Array.isArray(cdd.qsa) ? cdd.qsa : []),
    ...(Array.isArray(cdd.socios) ? cdd.socios : []),
    ...(Array.isArray(cdd.quadro_societario) ? cdd.quadro_societario : []),
    ...(Array.isArray(ai.socios) ? ai.socios : []),
    ...(Array.isArray(scraped.socios) ? scraped.socios : []),
  ];
  const seen = new Set<string>();
  const socios = sociosRaw
    .map((s: any) => {
      if (typeof s === "string") return { nome: s, qualificacao: null };
      return {
        nome:
          s?.nome_socio ||
          s?.nome ||
          s?.razao_social ||
          s?.nome_completo ||
          null,
        qualificacao:
          s?.qualificacao_socio ||
          s?.codigo_qualificacao_socio ||
          s?.qualificacao ||
          s?.cargo ||
          null,
      };
    })
    .filter((s: any) => {
      if (!s.nome) return false;
      const k = String(s.nome).trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const aiSocials = ai?.redes_sociais || {};
  const social = {
    instagram:
      r.social_media?.instagram ||
      cdd.instagram ||
      scraped.instagram ||
      aiSocials.instagram ||
      null,
    facebook:
      r.social_media?.facebook ||
      cdd.facebook ||
      scraped.facebook ||
      aiSocials.facebook ||
      null,
    linkedin:
      r.social_media?.linkedin ||
      scraped.linkedin ||
      aiSocials.linkedin ||
      null,
    youtube:
      r.social_media?.youtube || scraped.youtube || aiSocials.youtube || null,
    tiktok:
      r.social_media?.tiktok || scraped.tiktok || aiSocials.tiktok || null,
  };
  // Dados fiscais: IE, Simples, MEI, Capital Social
  const ie =
    brasil.inscricao_estadual ||
    cdd.inscricao_estadual ||
    ai.inscricao_estadual ||
    null;
  const inscricoesEstaduais: any[] = Array.isArray(brasil.inscricoes_estaduais)
    ? brasil.inscricoes_estaduais
    : [];
  const simples =
    typeof brasil.opcao_pelo_simples === "boolean"
      ? brasil.opcao_pelo_simples
      : typeof cdd.opcao_pelo_simples === "boolean"
        ? cdd.opcao_pelo_simples
        : null;
  const mei =
    typeof brasil.opcao_pelo_mei === "boolean"
      ? brasil.opcao_pelo_mei
      : typeof cdd.opcao_pelo_mei === "boolean"
        ? cdd.opcao_pelo_mei
        : null;
  const capitalSocialRaw =
    brasil.capital_social ?? cdd.capital_social ?? ai.capital_social ?? null;
  let capitalSocial: string | null = null;
  if (capitalSocialRaw != null && capitalSocialRaw !== "") {
    const n = Number(capitalSocialRaw);
    capitalSocial = Number.isFinite(n)
      ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 })
      : String(capitalSocialRaw);
  }
  return {
    cnpj, email, phone, website, socios, social, status,
    ie, inscricoesEstaduais, simples, mei, capitalSocial,
  };
};

export const ResultsList = ({ results, isLoading }: ResultsListProps) => {
  const { toast } = useToast();
  const [enrichedMap, setEnrichedMap] = useState<Record<string, any>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<
    "relevance" | "rating_desc" | "rating_asc" | "reviews_desc" | "name_asc" | "proximity"
  >("relevance");
  const [compact, setCompact] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("results_compact_mode");
    return saved === null ? true : saved === "true";
  });
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("results_compact_mode", String(compact));
    }
  }, [compact]);

  const toggleExpand = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const pageSize = 10;

  useEffect(() => {
    setPage(1);
    setSelected({});
  }, [results.length]);

  useEffect(() => {
    setPage(1);
  }, [sortBy]);

  const getEnriched = (r: any) =>
    enrichedMap[r.id] ||
    (r.enriched_data && Object.keys(r.enriched_data || {}).length
      ? { data: r.enriched_data, source: r.enriched_source }
      : null);

  const enrichOne = async (r: any) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      const exp = sessionData.session.expires_at ?? 0;
      const now = Math.floor(Date.now() / 1000);
      if (exp - now < 60) await supabase.auth.refreshSession();
    }
    const { invokeEdgeFunction } = await import("@/lib/edgeFunction");
    const data = await invokeEdgeFunction<any>("enrich-lead", {
      body: { resultId: r.id },
      showToast: false,
    });
    const enriched = (data as any).enriched_data;
    setEnrichedMap((prev) => ({
      ...prev,
      [r.id]: { data: enriched, source: (data as any).source },
    }));
    // Atualiza o objeto in-memory também para refletir nos próximos renders
    r.enriched_data = enriched;
    r.enriched_source = (data as any).source;
    return data;
  };

  // (early returns moved below hooks to keep hook order stable)

  // Ordenação aplicada antes da paginação
  const sortedResults = useMemo(() => {
    const arr = [...results];
    const num = (v: any) => (typeof v === "number" ? v : v ? Number(v) : 0);

    // Centroide para "proximidade" (sem geo do usuário, usa o centro dos resultados)
    const withCoords = arr.filter(
      (r) => r.latitude != null && r.longitude != null
    );
    const centroid =
      withCoords.length > 0
        ? {
            lat:
              withCoords.reduce((s, r) => s + Number(r.latitude), 0) /
              withCoords.length,
            lng:
              withCoords.reduce((s, r) => s + Number(r.longitude), 0) /
              withCoords.length,
          }
        : null;
    const dist = (r: any) => {
      if (!centroid || r.latitude == null || r.longitude == null)
        return Number.POSITIVE_INFINITY;
      const dx = Number(r.latitude) - centroid.lat;
      const dy = Number(r.longitude) - centroid.lng;
      return Math.sqrt(dx * dx + dy * dy);
    };

    switch (sortBy) {
      case "rating_desc":
        return arr.sort(
          (a, b) =>
            num(b.rating) - num(a.rating) ||
            num(b.reviews_count) - num(a.reviews_count)
        );
      case "rating_asc":
        return arr.sort(
          (a, b) => num(a.rating) - num(b.rating) || num(a.reviews_count) - num(b.reviews_count)
        );
      case "reviews_desc":
        return arr.sort((a, b) => num(b.reviews_count) - num(a.reviews_count));
      case "name_asc":
        return arr.sort((a, b) =>
          String(a.business_name || "").localeCompare(
            String(b.business_name || ""),
            "pt-BR",
            { sensitivity: "base" }
          )
        );
      case "proximity":
        return arr.sort((a, b) => dist(a) - dist(b));
      case "relevance":
      default:
        // Ordem original (como retornado pela busca)
        return arr;
    }
  }, [results, sortBy]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Toolbar skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/60 bg-card/80">
          <div className="flex items-center gap-3">
            <div className="size-4 rounded skeleton-shimmer" />
            <div className="h-4 w-40 skeleton-shimmer" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 skeleton-shimmer rounded-md" />
            <div className="h-8 w-44 skeleton-shimmer rounded-md" />
            <div className="h-8 w-40 skeleton-shimmer rounded-md" />
          </div>
        </div>
        {/* Inline radar mini-loader */}
        <div className="surface-raised p-4 flex items-center gap-4">
          <div className="relative w-12 h-12 shrink-0">
            <div className="radar absolute inset-0 rounded-full" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-6 rounded-full bg-primary text-accent flex items-center justify-center">
                <MapPin className="w-3.5 h-3.5" fill="currentColor" />
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Buscando empresas no Google Maps…</div>
            <div className="text-xs text-muted-foreground">Coletando dados de contato e localização</div>
            <div className="sweep-bar mt-2" />
          </div>
        </div>
        <LeadCardSkeleton count={6} compact={compact} />
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

  const totalPages = Math.max(1, Math.ceil(sortedResults.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageResults = sortedResults.slice(startIdx, startIdx + pageSize);

  const goToPage = (p: number) => {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const pageNumbers: number[] = [];
  const windowSize = 5;
  let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  for (let i = start; i <= end; i++) pageNumbers.push(i);

  const allPageSelected =
    pageResults.length > 0 && pageResults.every((r) => selected[r.id]);
  const somePageSelected = pageResults.some((r) => selected[r.id]);

  const togglePageAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      pageResults.forEach((r) => {
        if (checked) next[r.id] = true;
        else delete next[r.id];
      });
      return next;
    });
  };

  const toggleAllResults = () => {
    const allSelected = results.every((r) => selected[r.id]);
    if (allSelected) {
      setSelected({});
    } else {
      const next: Record<string, boolean> = {};
      results.forEach((r) => (next[r.id] = true));
      setSelected(next);
    }
  };

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const selectedCount = selectedIds.length;

  const handleBulkEnrich = async () => {
    const targets = results.filter((r) => selected[r.id] && !getEnriched(r));
    if (targets.length === 0) {
      toast({
        title: "Nada para enriquecer",
        description: "Os leads selecionados já estão enriquecidos.",
      });
      return;
    }
    setBulkEnriching(true);
    setProgress({ done: 0, total: targets.length });
    let success = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      try {
        await enrichOne(targets[i]);
        success++;
      } catch (e: any) {
        failed++;
        console.error("Falha ao enriquecer", targets[i].id, e);
      }
      setProgress({ done: i + 1, total: targets.length });
    }
    setBulkEnriching(false);
    setProgress(null);
    toast({
      title: "Enriquecimento concluído",
      description: `${success} sucesso${success !== 1 ? "s" : ""}${
        failed ? ` • ${failed} falha${failed !== 1 ? "s" : ""}` : ""
      }`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Barra de seleção em lote */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-[0_1px_0_hsl(0_0%_100%)_inset,0_2px_10px_-4px_hsl(240_6%_6%/0.05)]">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
            onCheckedChange={(v) => togglePageAll(!!v)}
            id="select-page"
          />
          <label htmlFor="select-page" className="text-sm cursor-pointer select-none">
            Selecionar página ({pageResults.length})
          </label>
          <Button variant="ghost" size="sm" onClick={toggleAllResults} className="text-xs">
            {results.every((r) => selected[r.id]) ? "Limpar seleção" : `Selecionar todos (${results.length})`}
          </Button>
          {selectedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedCount} selecionado{selectedCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCompact((c) => !c)}
            className="h-8 text-xs"
            title={compact ? "Visualização expandida" : "Visualização compacta"}
          >
            {compact ? (
              <>
                <LayoutList className="w-3.5 h-3.5 mr-1" />
                Expandir
              </>
            ) : (
              <>
                <Rows3 className="w-3.5 h-3.5 mr-1" />
                Compacto
              </>
            )}
          </Button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ordenar:</span>
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="relevance">Relevância</SelectItem>
              <SelectItem value="rating_desc">Melhor avaliação</SelectItem>
              <SelectItem value="rating_asc">Pior avaliação</SelectItem>
              <SelectItem value="reviews_desc">Mais avaliações</SelectItem>
              <SelectItem value="proximity">Proximidade</SelectItem>
              <SelectItem value="name_asc">Nome (A→Z)</SelectItem>
            </SelectContent>
          </Select>
        <Button
          onClick={handleBulkEnrich}
          disabled={selectedCount === 0 || bulkEnriching}
          size="sm"
        >
          {bulkEnriching ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Enriquecendo {progress ? `${progress.done}/${progress.total}` : ""}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Enriquecer selecionados {selectedCount > 0 ? `(${selectedCount})` : ""}
            </>
          )}
        </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-3">
        {pageResults.map((r: any) => {
          const enr = getEnriched(r);
          const isSelected = !!selected[r.id];
          const isExpanded = !compact || !!expandedCards[r.id];
          const ov = getOverlay(r, enr);
          if (compact) {
            return (
              <Card
                key={r.id}
                className={`lead-card border ${isSelected ? "is-selected" : ""}`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(v) =>
                      setSelected((prev) => {
                        const next = { ...prev };
                        if (v) next[r.id] = true;
                        else delete next[r.id];
                        return next;
                      })
                    }
                  />
                  <div className="size-9 rounded-xl bg-secondary text-foreground font-bold flex items-center justify-center text-sm shrink-0">
                    {(r.business_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm truncate leading-tight">
                        {r.business_name}
                      </h3>
                      {r.business_type && (
                        <div className="text-[11px] font-medium text-muted-foreground truncate mt-0.5">
                          {r.business_type}
                        </div>
                      )}
                    </div>
                    {r.rating ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold shrink-0 px-2 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        <Star className="w-3 h-3 fill-current" />
                        {r.rating}
                        {r.reviews_count ? <span className="text-muted-foreground font-normal">({r.reviews_count})</span> : null}
                      </span>
                    ) : null}
                    {ov.phone && (
                      <a
                        href={`tel:${ov.phone}`}
                        className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80 hover:text-primary truncate max-w-[160px] px-2 py-1 rounded-md hover:bg-secondary transition-colors"
                      >
                        <Phone className="w-3 h-3 text-muted-foreground" /> {ov.phone}
                      </a>
                    )}
                    {r.address && (
                      <span className="hidden lg:inline-flex items-center gap-1.5 text-xs text-muted-foreground truncate max-w-[260px]">
                        <MapPin className="w-3 h-3" /> {r.address}
                      </span>
                    )}
                    {enr && (
                      <Badge variant="default" className="shrink-0 text-[10px] bg-accent/20 text-accent-foreground border-accent/40">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Enriquecido
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleExpand(r.id)}
                    className="h-8 w-8 shrink-0 hover:bg-secondary"
                    aria-label={isExpanded ? "Recolher" : "Expandir"}
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </Button>
                </div>
                {isExpanded && (
                  <CardContent className="space-y-2.5 text-sm pt-4 border-t border-border/60 bg-muted/20 rounded-b-2xl">
                    {ov.cnpj && (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-mono font-semibold">{ov.cnpj}</span>
                        <Badge variant="outline" className="text-[10px]">CNPJ</Badge>
                        {ov.status && (
                          <Badge
                            className={`text-[10px] ${ov.status.active ? "bg-emerald-600 hover:bg-emerald-600 text-white border-transparent" : "bg-red-600 hover:bg-red-600 text-white border-transparent"}`}
                          >
                            {ov.status.active ? "Ativa" : ov.status.label}
                          </Badge>
                        )}
                      </div>
                    )}
                    {(ov.ie || ov.simples != null || ov.mei != null || ov.capitalSocial) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ov.mei === true && (
                          <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600 text-white border-transparent">MEI</Badge>
                        )}
                        {ov.mei === false && (
                          <Badge variant="outline" className="text-[10px]">Não MEI</Badge>
                        )}
                        {ov.simples === true && (
                          <Badge className="text-[10px] bg-sky-600 hover:bg-sky-600 text-white border-transparent">Simples Nacional</Badge>
                        )}
                        {ov.simples === false && (
                          <Badge variant="outline" className="text-[10px]">Lucro Presumido/Real</Badge>
                        )}
                        {ov.ie && (
                          <Badge variant="secondary" className="text-[10px] font-mono">IE: {ov.ie}</Badge>
                        )}
                        {ov.capitalSocial && (
                          <Badge variant="secondary" className="text-[10px]">Capital: {ov.capitalSocial}</Badge>
                        )}
                      </div>
                    )}
                    {r.business_type && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Building2 className="w-3 h-3 mr-1" />
                        {r.business_type}
                      </Badge>
                    )}
                    {r.address && (
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span className="text-xs leading-snug">{r.address}</span>
                      </div>
                    )}
                    {ov.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <a href={`tel:${ov.phone}`} className="text-xs text-primary hover:underline truncate">
                          {ov.phone}
                        </a>
                      </div>
                    )}
                    {ov.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <a href={`mailto:${ov.email}`} className="text-xs text-primary hover:underline truncate">
                          {ov.email}
                        </a>
                      </div>
                    )}
                    {ov.website && (
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <a
                          href={ov.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline truncate"
                        >
                          {ov.website}
                        </a>
                      </div>
                    )}
                    {ov.socios && ov.socios.length > 0 && (
                      <div className="rounded-md border border-border/60 bg-background/60 p-2">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          Sócios ({ov.socios.length})
                        </div>
                        <ul className="space-y-0.5">
                          {ov.socios.slice(0, 5).map((s: any, i: number) => (
                            <li key={i} className="text-xs">
                              <span className="font-medium">{s.nome}</span>
                              {s.qualificacao && (
                                <span className="text-muted-foreground"> • {s.qualificacao}</span>
                              )}
                            </li>
                          ))}
                          {ov.socios.length > 5 && (
                            <li className="text-[11px] text-muted-foreground">
                              +{ov.socios.length - 5} outro(s)
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3 pt-1">
                      {ov.social.instagram && (
                        <a
                          href={instagramUrl(ov.social.instagram)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <Instagram className="w-3 h-3" /> Instagram
                        </a>
                      )}
                      {ov.social.facebook && (
                        <a
                          href={facebookUrl(ov.social.facebook)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <Facebook className="w-3 h-3" /> Facebook
                        </a>
                      )}
                      {r.additional_data?.google_url && (
                        <a
                          href={r.additional_data.google_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <MapPin className="w-3 h-3" /> Mapa
                        </a>
                      )}
                    </div>
                    {(r.source_api || enr) && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {r.source_api && (
                            <Badge variant="outline" className="text-[10px]">
                              {r.source_api}
                            </Badge>
                          )}
                        </div>
                        {enr ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setOpenDialog(r.id)}
                            className="text-xs h-7"
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            Ver dados
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          }
          return (
            <Card
              key={r.id}
              className={`lead-card border ${isSelected ? "is-selected" : ""}`}
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(v) =>
                        setSelected((prev) => {
                          const next = { ...prev };
                          if (v) next[r.id] = true;
                          else delete next[r.id];
                          return next;
                        })
                      }
                      className="mt-1"
                    />
                    <div className="size-10 rounded-xl bg-secondary text-foreground font-bold flex items-center justify-center text-base shrink-0">
                      {(r.business_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-base leading-tight truncate">
                        {r.business_name}
                      </h3>
                      {r.business_type && (
                        <Badge variant="secondary" className="mt-1.5 text-[10px] font-semibold">
                          <Building2 className="w-3 h-3 mr-1" />
                          {r.business_type}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.rating ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        <Star className="w-3 h-3 fill-current" />
                        {r.rating}
                      </span>
                    ) : null}
                    {enr && (
                      <Badge variant="default" className="text-[10px] bg-accent/20 text-accent-foreground border-accent/40">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Enriquecido
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                {ov.cnpj && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
                    <div className="size-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-mono font-semibold">{ov.cnpj}</span>
                    <Badge variant="outline" className="text-[10px] ml-auto">CNPJ</Badge>
                    {ov.status && (
                      <Badge
                        className={`text-[10px] ${ov.status.active ? "bg-emerald-600 hover:bg-emerald-600 text-white border-transparent" : "bg-red-600 hover:bg-red-600 text-white border-transparent"}`}
                      >
                        {ov.status.active ? "Ativa" : ov.status.label}
                      </Badge>
                    )}
                  </div>
                )}
                {r.address && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <div className="size-6 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs leading-snug pt-1">{r.address}</span>
                  </div>
                )}
                {ov.phone && (
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                      <Phone className="w-3.5 h-3.5" />
                    </div>
                    <a href={`tel:${ov.phone}`} className="text-xs font-medium text-foreground hover:text-primary hover:underline truncate">
                      {ov.phone}
                    </a>
                  </div>
                )}
                {ov.email && (
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                      <Mail className="w-3.5 h-3.5" />
                    </div>
                    <a href={`mailto:${ov.email}`} className="text-xs font-medium text-foreground hover:text-primary hover:underline truncate">
                      {ov.email}
                    </a>
                  </div>
                )}
                {ov.website && (
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                      <Globe className="w-3.5 h-3.5" />
                    </div>
                    <a
                      href={ov.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-foreground hover:text-primary hover:underline truncate"
                    >
                      {ov.website}
                    </a>
                  </div>
                )}
                {ov.socios && ov.socios.length > 0 && (
                  <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Sócios ({ov.socios.length})
                    </div>
                    <ul className="space-y-0.5">
                      {ov.socios.slice(0, 5).map((s: any, i: number) => (
                        <li key={i} className="text-xs">
                          <span className="font-medium">{s.nome}</span>
                          {s.qualificacao && (
                            <span className="text-muted-foreground"> • {s.qualificacao}</span>
                          )}
                        </li>
                      ))}
                      {ov.socios.length > 5 && (
                        <li className="text-[11px] text-muted-foreground">
                          +{ov.socios.length - 5} outro(s)
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                <div className="flex flex-wrap gap-3 pt-1">
                  {ov.social.instagram && (
                    <a
                      href={instagramUrl(ov.social.instagram)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <Instagram className="w-3 h-3" /> Instagram
                    </a>
                  )}
                  {ov.social.facebook && (
                    <a
                      href={facebookUrl(ov.social.facebook)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <Facebook className="w-3 h-3" /> Facebook
                    </a>
                  )}
                  {ov.social.linkedin && (
                    <a
                      href={ov.social.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      LinkedIn
                    </a>
                  )}
                  {r.additional_data?.google_url && (
                    <a
                      href={r.additional_data.google_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <MapPin className="w-3 h-3" /> Mapa
                    </a>
                  )}
                </div>
                <div className="flex items-center justify-between pt-3 mt-1 border-t border-border/60">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {r.reviews_count ? (
                      <span className="font-medium">{r.reviews_count} avaliações</span>
                    ) : (
                      <span>Sem avaliações</span>
                    )}
                    {r.source_api && (
                      <Badge variant="outline" className="text-[10px] font-semibold">
                        {r.source_api}
                      </Badge>
                    )}
                  </div>
                  {enr ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setOpenDialog(r.id)}
                      className="text-xs h-8 font-semibold"
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      Ver dados
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={(e) => {
                  e.preventDefault();
                  goToPage(currentPage - 1);
                }}
                className={currentPage === 1 ? "pointer-events-none opacity-50 cursor-not-allowed" : "cursor-pointer"}
              />
            </PaginationItem>
            {start > 1 && (
              <>
                <PaginationItem>
                  <PaginationLink onClick={(e) => { e.preventDefault(); goToPage(1); }} className="cursor-pointer">1</PaginationLink>
                </PaginationItem>
                {start > 2 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
              </>
            )}
            {pageNumbers.map((p) => (
              <PaginationItem key={p}>
                <PaginationLink
                  isActive={p === currentPage}
                  onClick={(e) => { e.preventDefault(); goToPage(p); }}
                  className="cursor-pointer"
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ))}
            {end < totalPages && (
              <>
                {end < totalPages - 1 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
                <PaginationItem>
                  <PaginationLink onClick={(e) => { e.preventDefault(); goToPage(totalPages); }} className="cursor-pointer">{totalPages}</PaginationLink>
                </PaginationItem>
              </>
            )}
            <PaginationItem>
              <PaginationNext
                onClick={(e) => { e.preventDefault(); goToPage(currentPage + 1); }}
                className={currentPage === totalPages ? "pointer-events-none opacity-50 cursor-not-allowed" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <div className="text-center text-sm text-muted-foreground">
        Exibindo {startIdx + 1}–{Math.min(startIdx + pageSize, results.length)} de {results.length} resultado{results.length !== 1 ? "s" : ""}
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
            const brasil = enr.data?.brasilapi;
            const formatCnpj = (raw: any): string | null => {
              if (!raw) return null;
              const d = String(raw).replace(/\D/g, "");
              if (d.length !== 14) return String(raw);
              return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
            };
            const cnpj =
              formatCnpj(cdd?.cnpj) ||
              formatCnpj(brasil?.cnpj) ||
              formatCnpj(ai?.cnpj);
            return (
              <div className="space-y-4 text-sm">
                {cnpj && (
                  <div className="border rounded-md p-3 bg-primary/5 border-primary/30">
                    <h4 className="font-semibold mb-1">CNPJ</h4>
                    <p className="font-mono text-base">{cnpj}</p>
                  </div>
                )}
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
                      {cdd.proprietario && <><dt className="text-muted-foreground">Proprietário</dt><dd className="font-medium">{cdd.proprietario}</dd></>}
                      {cdd.telefone && <><dt className="text-muted-foreground">Telefone direto</dt><dd><a href={`tel:${cdd.telefone}`} className="text-primary hover:underline">{cdd.telefone}</a></dd></>}
                      {cdd.email && <><dt className="text-muted-foreground">E-mail</dt><dd><a href={`mailto:${cdd.email}`} className="text-primary hover:underline">{cdd.email}</a></dd></>}
                      {cdd.instagram && <><dt className="text-muted-foreground">Instagram</dt><dd><a href={instagramUrl(cdd.instagram)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{cdd.instagram}</a></dd></>}
                      {cdd.facebook && <><dt className="text-muted-foreground">Facebook</dt><dd><a href={facebookUrl(cdd.facebook)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{cdd.facebook}</a></dd></>}
                    </dl>
                    {Array.isArray(cdd.socios) && cdd.socios.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-1">Sócios / QSA</p>
                        <ul className="list-disc pl-5 space-y-0.5 text-xs">
                          {cdd.socios.slice(0, 8).map((s: any, i: number) => (
                            <li key={i}>
                              {s.nome_socio || s.nome || s.razao_social || "—"}
                              {s.qualificacao_socio || s.qualificacao
                                ? ` — ${s.qualificacao_socio || s.qualificacao}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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