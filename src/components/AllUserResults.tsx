import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Search as SearchIcon,
  RefreshCw,
  Sparkles,
  Filter,
  X,
  Globe,
  MapPin,
  MessageCircle,
  Kanban,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SendWhatsAppDialog } from "@/components/SendWhatsAppDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LeadRow {
  id: string;
  business_name: string;
  business_type: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  social_media: any;
  rating: number | null;
  reviews_count: number | null;
  source_api: string | null;
  enriched_source: string | null;
  created_at: string;
  search_id: string;
  searches?: {
    category: string;
    state: string;
    city: string;
    neighborhood: string | null;
    search_query: string | null;
    created_at: string;
  };
}

const ALL = "__all__";

export const AllUserResults = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [waLead, setWaLead] = useState<LeadRow | null>(null);
  const [responders, setResponders] = useState<Set<string>>(new Set());
  const [contacted, setContacted] = useState<Set<string>>(new Set());

  // Filtros
  const [filter, setFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<string>(ALL);
  const [cityFilter, setCityFilter] = useState<string>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [sourceFilter, setSourceFilter] = useState<string>(ALL);
  const [hasEmail, setHasEmail] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [hasWebsite, setHasWebsite] = useState(false);
  const [enrichedOnly, setEnrichedOnly] = useState(false);
  const [minRating, setMinRating] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("search_results")
        .select(
          "*, searches!inner(user_id, category, state, city, neighborhood, search_query, created_at)"
        )
        .eq("searches.user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e) {
      console.error("fetch all results error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [user?.id]);

  // Carrega telefones que já responderam (têm mensagem inbound no CRM)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: msgs } = await supabase
        .from("crm_messages")
        .select("conversation_id")
        .eq("user_id", user.id)
        .eq("direction", "in");
      if (!msgs?.length) return;
      const ids = Array.from(new Set(msgs.map((m: any) => m.conversation_id)));
      const { data: convs } = await supabase.from("crm_conversations").select("phone").in("id", ids);
      setResponders(new Set((convs || []).map((c: any) => normalizePhone(c.phone))));
    })();
  }, [user?.id]);

  // Telefones já contatados via WhatsApp (status=sent)
  const fetchContacted = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("message_history")
      .select("phone")
      .eq("user_id", user.id)
      .eq("status", "sent");
    setContacted(new Set((data || []).map((m: any) => normalizePhone(m.phone))));
  };
  useEffect(() => { fetchContacted(); }, [user?.id]);

  // Opções dinâmicas
  const uniqStates = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.searches?.state).filter(Boolean))).sort() as string[],
    [rows]
  );
  const uniqCities = useMemo(() => {
    const filtered = stateFilter === ALL ? rows : rows.filter((r) => r.searches?.state === stateFilter);
    return Array.from(new Set(filtered.map((r) => r.searches?.city).filter(Boolean))).sort() as string[];
  }, [rows, stateFilter]);
  const uniqCategories = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.searches?.category).filter(Boolean))).sort() as string[],
    [rows]
  );
  const uniqSources = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.source_api).filter(Boolean))).sort() as string[],
    [rows]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const minR = minRating ? Number(minRating) : null;
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 86400000 : null;

    return rows.filter((r) => {
      if (q) {
        const hay = [
          r.business_name,
          r.business_type,
          r.address,
          r.phone,
          r.email,
          r.website,
          r.searches?.category,
          r.searches?.city,
          r.searches?.state,
          r.searches?.neighborhood,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
        if (!hay) return false;
      }
      if (stateFilter !== ALL && r.searches?.state !== stateFilter) return false;
      if (cityFilter !== ALL && r.searches?.city !== cityFilter) return false;
      if (categoryFilter !== ALL && r.searches?.category !== categoryFilter) return false;
      if (sourceFilter !== ALL && r.source_api !== sourceFilter) return false;
      if (hasEmail && !r.email) return false;
      if (hasPhone && !r.phone) return false;
      if (hasWebsite && !r.website) return false;
      if (enrichedOnly && !r.enriched_source) return false;
      if (minR !== null && (r.rating == null || Number(r.rating) < minR)) return false;
      if (fromTs && new Date(r.created_at).getTime() < fromTs) return false;
      if (toTs && new Date(r.created_at).getTime() >= toTs) return false;
      return true;
    });
  }, [
    rows,
    filter,
    stateFilter,
    cityFilter,
    categoryFilter,
    sourceFilter,
    hasEmail,
    hasPhone,
    hasWebsite,
    enrichedOnly,
    minRating,
    dateFrom,
    dateTo,
  ]);

  const clearFilters = () => {
    setFilter("");
    setStateFilter(ALL);
    setCityFilter(ALL);
    setCategoryFilter(ALL);
    setSourceFilter(ALL);
    setHasEmail(false);
    setHasPhone(false);
    setHasWebsite(false);
    setEnrichedOnly(false);
    setMinRating("");
    setDateFrom("");
    setDateTo("");
  };

  const activeFiltersCount =
    (filter ? 1 : 0) +
    (stateFilter !== ALL ? 1 : 0) +
    (cityFilter !== ALL ? 1 : 0) +
    (categoryFilter !== ALL ? 1 : 0) +
    (sourceFilter !== ALL ? 1 : 0) +
    (hasEmail ? 1 : 0) +
    (hasPhone ? 1 : 0) +
    (hasWebsite ? 1 : 0) +
    (enrichedOnly ? 1 : 0) +
    (minRating ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const headers = [
      "Empresa", "Tipo", "Endereço", "Telefone", "Email", "Website",
      "Instagram", "Facebook", "Avaliação", "Reviews",
      "Busca (Categoria)", "Cidade", "Estado", "Bairro",
      "Fonte", "Enriquecido", "Capturado em",
    ];
    const data = filtered.map((r) => [
      r.business_name || "",
      r.business_type || "",
      r.address || "",
      r.phone || "",
      r.email || "",
      r.website || "",
      r.social_media?.instagram || "",
      r.social_media?.facebook || "",
      r.rating ?? "",
      r.reviews_count ?? "",
      r.searches?.category || "",
      r.searches?.city || "",
      r.searches?.state || "",
      r.searches?.neighborhood || "",
      r.source_api || "",
      r.enriched_source || "",
      new Date(r.created_at).toLocaleString("pt-BR"),
    ]);
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        row.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico_leads_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle>Histórico de Leads</CardTitle>
            <CardDescription>
              Todos os leads capturados em suas buscas — filtre e exporte conforme precisar.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* Busca livre */}
        <div className="relative mt-4">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar por nome, cidade, telefone, email..."
            className="pl-9"
          />
        </div>

        {/* Filtros */}
        <div className="mt-4 p-3 rounded-lg border bg-muted/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="w-4 h-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="text-xs">{activeFiltersCount} ativo{activeFiltersCount !== 1 ? "s" : ""}</Badge>
              )}
            </div>
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                <X className="w-3 h-3 mr-1" />
                Limpar
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Estado</label>
              <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setCityFilter(ALL); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {uniqStates.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Cidade</label>
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {uniqCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Categoria</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {uniqCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Fonte</label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {uniqSources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Avaliação mínima</label>
              <Select value={minRating || ALL} onValueChange={(v) => setMinRating(v === ALL ? "" : v)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Qualquer" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={ALL}>Qualquer</SelectItem>
                  <SelectItem value="3">3★ ou mais</SelectItem>
                  <SelectItem value="4">4★ ou mais</SelectItem>
                  <SelectItem value="4.5">4.5★ ou mais</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">De</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Até</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-xs" />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-2 border-t">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={hasEmail} onCheckedChange={(v) => setHasEmail(!!v)} />
              Com e-mail
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={hasPhone} onCheckedChange={(v) => setHasPhone(!!v)} />
              Com telefone
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={hasWebsite} onCheckedChange={(v) => setHasWebsite(!!v)} />
              Com website
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={enrichedOnly} onCheckedChange={(v) => setEnrichedOnly(!!v)} />
              Apenas enriquecidos
            </label>
          </div>
        </div>

        <div className="text-sm text-muted-foreground mt-2">
          {filtered.length} de {rows.length} lead{rows.length !== 1 ? "s" : ""}
        </div>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3" />
            <p className="text-muted-foreground">Carregando seus leads...</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            Você ainda não capturou nenhum lead. Faça uma busca em "Nova Busca".
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            Nenhum lead corresponde aos filtros aplicados.
          </p>
        ) : (
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-12 text-center">Site</TableHead>
                  <TableHead className="w-12 text-center">End.</TableHead>
                  <TableHead className="w-12 text-center">WhatsApp</TableHead>
                  <TableHead className="w-12 text-center">CRM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const responded = r.phone ? responders.has(normalizePhone(r.phone)) : false;
                  const wasContacted = r.phone ? contacted.has(normalizePhone(r.phone)) : false;
                  return (
                  <TableRow key={r.id} className={wasContacted ? "bg-amber-500/5 hover:bg-amber-500/10" : ""}>
                    <TableCell className="font-medium">{r.business_name}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {r.phone ? (
                        <a href={`tel:${r.phone}`} className="text-primary hover:underline">{r.phone}</a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.email ? (
                        <a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.website ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon-sm" title="Ver website"><Globe className="size-4 text-primary" /></Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 text-xs break-all">
                            <div className="font-semibold mb-1">Website</div>
                            <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{r.website}</a>
                          </PopoverContent>
                        </Popover>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.address ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon-sm" title="Ver endereço"><MapPin className="size-4 text-primary" /></Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 text-xs">
                            <div className="font-semibold mb-1">Endereço</div>
                            <p>{r.address}</p>
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline mt-2 inline-block">Abrir no Google Maps</a>
                          </PopoverContent>
                        </Popover>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.phone ? (
                        <Button variant="ghost" size="icon-sm" onClick={() => setWaLead(r)} title={wasContacted ? "Já contatado — enviar novamente" : "Enviar WhatsApp"}>
                          <MessageCircle className="size-4 text-green-600" />
                        </Button>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={!responded}
                        onClick={() => window.dispatchEvent(new CustomEvent("dashboard:tab", { detail: "addon-crm" }))}
                        title={responded ? "Abrir no CRM" : "Contato ainda não respondeu"}
                        className={responded ? "" : "opacity-40 cursor-not-allowed"}
                      >
                        <Kanban className={`size-4 ${responded ? "text-primary" : ""}`} />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        )}
      </CardContent>
      {waLead && (
        <SendWhatsAppDialog
          open={!!waLead}
          onOpenChange={(o) => { if (!o) { setWaLead(null); fetchContacted(); } }}
          lead={{
            id: waLead.id,
            nome: waLead.business_name,
            telefone: waLead.phone,
            email: waLead.email,
            site: waLead.website,
            cidade: waLead.searches?.city,
            estado: waLead.searches?.state,
            bairro: waLead.searches?.neighborhood,
            ramo: waLead.searches?.category,
          }}
        />
      )}
    </Card>
  );
};

function normalizePhone(p?: string | null): string {
  return String(p || "").replace(/\D/g, "");
}