import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { SearchForm } from "@/components/SearchForm";
import { TrendingUp, Users, Sparkles, CheckCircle2, KeyRound, History, AlertTriangle, Package, CreditCard, Zap, Target, ArrowUpRight, Bot, MessageCircle, Mail, Download, Puzzle } from "lucide-react";
import { ResultsSection } from "@/components/ResultsSection";
import { ApiConfigManager } from "@/components/admin/ApiConfigManager";
import { ApiErrorLogs } from "@/components/admin/ApiErrorLogs";
import { SourceHistory } from "@/components/admin/SourceHistory";
import { AiPromptManager } from "@/components/admin/AiPromptManager";
import { AllUserResults } from "@/components/AllUserResults";
import { UserManager } from "@/components/admin/UserManager";
import { PackagesManager } from "@/components/admin/PackagesManager";
import { AddonsManager } from "@/components/admin/AddonsManager";
import { PaymentsConfig } from "@/components/admin/PaymentsConfig";
import { EvolutionApiConfig } from "@/components/admin/EvolutionApiConfig";
import { EmailOAuthConfig } from "@/components/admin/EmailOAuthConfig";
import { DataExport } from "@/components/admin/DataExport";
import { PurchasesHistory } from "@/components/PurchasesHistory";
import { AddonsMarketplace } from "@/components/addons/AddonsMarketplace";
import { WhatsAppAddon } from "@/components/addons/WhatsAppAddon";
import { WhatsAppCrmAddon } from "@/components/addons/WhatsAppCrmAddon";
import { EmailMarketingAddon } from "@/components/addons/EmailMarketingAddon";
import { explainEdgeError } from "@/lib/edgeFunction";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, type DashboardTab } from "@/components/AppSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Dashboard() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [searches, setSearches] = useState([]);
  const [packages, setPackages] = useState([]);
  const [activeTab, setActiveTab] = useState<DashboardTab>("search");
  const [selectedSearch, setSelectedSearch] = useState(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<"test" | "live">("test");
  const [leadsStats, setLeadsStats] = useState<{ total: number; enriched: number }>({ total: 0, enriched: 0 });
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchUserSearches();
      fetchPackages();
      fetchLeadsStats();
    }
  }, [user]);

  useEffect(() => {
    const h = (e: Event) => {
      const tab = (e as CustomEvent).detail as DashboardTab;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener("dashboard:tab", h);
    return () => window.removeEventListener("dashboard:tab", h);
  }, []);

  const fetchUserSearches = async () => {
    try {
      const { data, error } = await supabase
        .from('searches')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSearches(data || []);
    } catch (error) {
      console.error('Error fetching searches:', error);
    }
  };

  const fetchPackages = async () => {
    try {
      const { data, error } = await supabase
        .from('search_packages')
        .select('*')
        .eq('is_active', true)
        .order('searches_limit');
      if (error) throw error;
      setPackages(data || []);
    } catch (error) {
      console.error('Error fetching packages:', error);
    }
  };

  const fetchLeadsStats = async () => {
    if (!user?.id) return;
    try {
      // IDs das buscas do usuário
      const { data: userSearches } = await supabase
        .from('searches')
        .select('id')
        .eq('user_id', user.id);
      const ids = (userSearches || []).map((s: any) => s.id);
      if (ids.length === 0) {
        setLeadsStats({ total: 0, enriched: 0 });
        return;
      }
      const [{ count: total }, { count: enriched }] = await Promise.all([
        supabase.from('search_results').select('*', { count: 'exact', head: true }).in('search_id', ids),
        supabase.from('search_results').select('*', { count: 'exact', head: true }).in('search_id', ids).not('enriched_at', 'is', null),
      ]);
      setLeadsStats({ total: total || 0, enriched: enriched || 0 });
    } catch (e) {
      console.error('fetchLeadsStats error', e);
    }
  };

  const handleBuyPackage = async (pkg: any) => {
    setPurchasingId(pkg.id);
    try {
      const { data, error } = await supabase.functions.invoke("mp-create-preference", {
        body: {
          packageId: pkg.id,
          mode: paymentMode,
          returnUrl: `${window.location.origin}/payment/return`,
        },
      });
      if (error) {
        let friendly = error.message as string;
        try {
          const body = await error.context?.json?.();
          if (body?.message) friendly = body.message;
          else if (body?.error) friendly = body.error;
        } catch {
          // corpo não-JSON: mantém a mensagem original
        }
        throw new Error(friendly);
      }
      if (!data?.initPoint) throw new Error("URL de checkout não retornada");
      window.location.href = data.initPoint;
    } catch (e: any) {
      console.error("Erro ao iniciar pagamento", e);
      toast({
        title: "Não foi possível iniciar o pagamento",
        description:
          e?.message ||
          "Verifique se o Access Token do Mercado Pago está configurado no painel admin.",
        variant: "destructive",
      });
      setPurchasingId(null);
    }
  };

  const handleSearch = async (searchData: { category: string; state: string; city: string; neighborhood?: string }) => {
    if (!profile) return;

    if (profile.searches_used >= profile.plan_searches_limit) {
      toast({
        title: "Limite de buscas atingido",
        description: "Faça upgrade do seu plano para continuar buscando.",
        variant: "destructive",
      });
      setActiveTab("plans");
      return;
    }

    try {
      const { data: searchRecord, error: searchError } = await supabase
        .from('searches')
        .insert({
          user_id: user?.id,
          category: searchData.category,
          state: searchData.state,
          city: searchData.city,
          neighborhood: searchData.neighborhood,
          search_query: `${searchData.category} ${searchData.city} ${searchData.state}${searchData.neighborhood ? ` ${searchData.neighborhood}` : ''}`,
          status: 'pending'
        })
        .select()
        .single();

      if (searchError) throw searchError;

      await supabase
        .from('profiles')
        .update({ searches_used: profile.searches_used + 1 })
        .eq('user_id', user?.id);

      const { error: functionError } = await supabase.functions.invoke('web-search', {
        body: {
          searchId: searchRecord.id,
          category: searchData.category,
          state: searchData.state,
          city: searchData.city,
          neighborhood: searchData.neighborhood
        }
      });

      if (functionError) {
        const ex = explainEdgeError(functionError);
        toast({ title: ex.title, description: ex.description, variant: "destructive" });
        return;
      }

      toast({
        title: "Busca iniciada",
        description: "Sua busca está sendo processada.",
      });

      fetchUserSearches();
      setSelectedSearch(searchRecord);

      const newUsed = profile.searches_used + 1;
      if (newUsed >= profile.plan_searches_limit) {
        toast({
          title: "Pacote esgotado",
          description: "Esta foi sua última busca. Faça upgrade para continuar.",
        });
        setActiveTab("plans");
      } else {
        setActiveTab("results");
      }

    } catch (error: any) {
      console.error('Error starting search:', error);
      const ex = explainEdgeError(error);
      toast({
        title: ex.title,
        description: ex.description,
        variant: "destructive",
      });
    }
  };

  const usagePercentage = profile ? (profile.searches_used / profile.plan_searches_limit) * 100 : 0;
  const remaining = Math.max(0, (profile?.plan_searches_limit || 0) - (profile?.searches_used || 0));

  const headlines: Record<DashboardTab, { title: string; subtitle: string }> = {
    search: {
      title: "Preparado para o próximo sprint?",
      subtitle: `Você tem ${remaining} buscas restantes para acelerar suas metas.`,
    },
    results: { title: "Histórico de Leads", subtitle: "Explore, filtre e enriqueça todos os contatos já extraídos." },
    history: { title: "Histórico de prospecções", subtitle: "Revise tudo o que você já buscou." },
    plans: { title: "Escolha sua velocidade", subtitle: "Faça upgrade para ampliar seus limites mensais." },
    purchases: { title: "Minhas compras", subtitle: "Acompanhe o status dos seus pacotes adquiridos." },
    addons: { title: "Marketplace de Add-ons", subtitle: "Amplie o sistema com recursos para acelerar sua prospecção." },
    "addon-whatsapp": { title: "WhatsApp Prospect", subtitle: "Conecte seu número, crie templates e dispare mensagens personalizadas para seus leads." },
    "addon-crm": { title: "WhatsApp CRM Pro", subtitle: "Inbox em tempo real, Kanban, respostas rápidas, mídias, botões e fluxos automáticos." },
    "addon-email": { title: "Email Marketing", subtitle: "Conecte até 5 contas, defina limites diários, ordem de envio e modo rotacional." },
    admin: { title: "Painel administrativo", subtitle: "Gerencie usuários, APIs e configurações." },
  };
  const head = headlines[activeTab];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar active={activeTab} onChange={setActiveTab} isAdmin={isAdmin} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 sticky top-0 z-20 bg-background/75 backdrop-blur-xl border-b border-border/70 flex items-center px-4 md:px-8 gap-4">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div className="h-6 w-px bg-border/70 hidden md:block" />
            <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground hidden md:inline">Dashboard</span>
              <span className="text-muted-foreground/60 hidden md:inline">/</span>
              <span className="font-semibold truncate capitalize">{activeTab === "search" ? "Nova busca" : activeTab}</span>
            </div>
            {isAdmin && (
              <Badge className="bg-primary text-accent hover:bg-primary/90 gap-1">
                <Sparkles className="size-3" /> ADMIN
              </Badge>
            )}
          </header>

          <main className="flex-1 px-4 md:px-10 py-8 max-w-7xl w-full mx-auto animate-fade-in">
            {/* Hero panel */}
            <div className="hero-panel hero-grid mb-6 p-4 md:p-5">
              <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 mb-2 chip-volt">
                    <Zap className="size-3" fill="currentColor" /> Velocity Track
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold tracking-tight text-balance mb-1 text-foreground">{head.title}</h2>
                  <p className="text-sm text-muted-foreground font-medium text-pretty">{head.subtitle}</p>
                </div>
                {activeTab === "search" && (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-background/70 border border-border/60 backdrop-blur">
                      <div className="size-2 rounded-full bg-success animate-pulse" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pace</span>
                      <span className="text-sm font-bold tabular-nums">{profile?.searches_used || 0} buscas</span>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground border border-primary/30 backdrop-blur">
                      <Zap className="size-3.5 text-accent" fill="currentColor" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">Plano</span>
                      <span className="text-sm font-bold capitalize text-accent">{profile?.plan || "Basic"}</span>
                      <button
                        onClick={() => setActiveTab("plans")}
                        className="text-[11px] font-semibold text-accent hover:underline inline-flex items-center gap-0.5"
                      >
                        Upgrade <ArrowUpRight className="size-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            {activeTab === "search" && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
                <div className="stat-tile">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="size-9 rounded-xl bg-accent/15 text-accent-foreground flex items-center justify-center">
                        <Target className="size-4" />
                      </div>
                      <span className="text-sm font-semibold text-muted-foreground">Volume de Buscas</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-bold">CICLO</Badge>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1.5 mb-3">
                      <span className="text-4xl font-bold tabular-nums tracking-tight">
                        {profile?.searches_used || 0}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground">
                        / {profile?.plan_searches_limit || 0}
                      </span>
                    </div>
                    <Progress value={usagePercentage} className="h-2" />
                    <div className="text-[11px] font-semibold text-muted-foreground mt-2 uppercase tracking-wider">
                      {Math.round(usagePercentage)}% utilizado
                    </div>
                  </div>
                </div>

                <div className="stat-tile">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="size-9 rounded-xl bg-success/10 text-success flex items-center justify-center">
                        <TrendingUp className="size-4" />
                      </div>
                      <span className="text-sm font-semibold text-muted-foreground">Total Histórico</span>
                    </div>
                    <span className="text-xs font-bold text-success bg-success/10 px-2 py-1 rounded-md flex items-center gap-1">
                      <ArrowUpRight className="size-3" /> ativo
                    </span>
                  </div>
                  <div>
                    <div className="text-4xl font-bold tabular-nums tracking-tight">{searches.length}</div>
                    <div className="text-sm font-medium text-muted-foreground mt-1">prospecções realizadas</div>
                  </div>
                </div>

                <div className="stat-tile">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        <Users className="size-4" />
                      </div>
                      <span className="text-sm font-semibold text-muted-foreground">Leads Capturados</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-bold">TOTAL</Badge>
                  </div>
                  <div>
                    <div className="text-4xl font-bold tabular-nums tracking-tight">
                      {leadsStats.total.toLocaleString("pt-BR")}
                    </div>
                    <div className="text-sm font-medium text-muted-foreground mt-1">empresas encontradas</div>
                  </div>
                </div>

                <div className="stat-tile">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="size-9 rounded-xl bg-success/10 text-success flex items-center justify-center">
                        <Sparkles className="size-4" />
                      </div>
                      <span className="text-sm font-semibold text-muted-foreground">Enriquecidos (IA)</span>
                    </div>
                    <span className="text-xs font-bold text-success bg-success/10 px-2 py-1 rounded-md">
                      {leadsStats.total > 0
                        ? `${Math.round((leadsStats.enriched / leadsStats.total) * 100)}%`
                        : "0%"}
                    </span>
                  </div>
                  <div>
                    <div className="text-4xl font-bold tabular-nums tracking-tight text-success">
                      {leadsStats.enriched.toLocaleString("pt-BR")}
                    </div>
                    <Progress
                      value={leadsStats.total > 0 ? (leadsStats.enriched / leadsStats.total) * 100 : 0}
                      className="h-2 mt-3"
                    />
                    <div className="text-[11px] font-semibold text-muted-foreground mt-2 uppercase tracking-wider">
                      CNPJ + e-mail + redes
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* Content per tab */}
            {activeTab === "search" && (
              <SearchForm onSearch={handleSearch} selectedSearch={selectedSearch} />
            )}

            {activeTab === "results" && (
              <div className="space-y-6">
                {selectedSearch && <ResultsSection searchData={selectedSearch} />}
                <AllUserResults />
              </div>
            )}

            {activeTab === "history" && (
              <div className="card-elevated p-6">
                <h3 className="font-bold text-lg mb-4">Histórico de Buscas</h3>
                {searches.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {searches.map((search: any) => (
                      <div
                        key={search.id}
                        className="group flex items-center justify-between p-4 rounded-xl bg-secondary/40 hover:bg-secondary transition-colors"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="size-10 bg-background rounded-lg flex items-center justify-center font-bold text-sm shrink-0 group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                            {(search.state || "?").slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold truncate">{search.search_query}</div>
                            <div className="text-xs font-medium text-muted-foreground">
                              {new Date(search.created_at).toLocaleString("pt-BR")}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant={search.status === "completed" ? "default" : "secondary"}>
                            {search.status}
                          </Badge>
                          {search.status === "completed" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setSelectedSearch(search);
                                setActiveTab("results");
                              }}
                            >
                              Abrir Lista
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">Nenhuma busca realizada ainda</p>
                )}
              </div>
            )}

            {activeTab === "plans" && (
              <div className="space-y-6">
                <div className="flex items-center justify-end gap-3 text-xs">
                  <span className="text-muted-foreground font-medium">Modo de pagamento</span>
                  <div className="inline-flex p-1 rounded-xl bg-muted border border-border/60">
                    <button
                      onClick={() => setPaymentMode("test")}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${paymentMode === "test" ? "bg-card shadow-sm text-amber-700 dark:text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Teste
                    </button>
                    <button
                      onClick={() => setPaymentMode("live")}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${paymentMode === "live" ? "bg-card shadow-sm text-success" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Produção
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {packages.map((pkg: any) => {
                  const isCurrent = pkg.name.toLowerCase() === profile?.plan;
                  const isPopular = packages[1]?.id === pkg.id && packages.length >= 3;
                  return (
                    <div
                      key={pkg.id}
                      className={`pkg-card p-7 flex flex-col gap-5 ${
                        isCurrent ? "is-current" : isPopular ? "is-popular" : ""
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute -top-3 right-5 px-3 py-1 bg-accent text-accent-foreground text-[10px] font-bold tracking-wider rounded-full shadow-sm uppercase">
                          Plano atual
                        </div>
                      )}
                      {!isCurrent && isPopular && (
                        <div className="absolute -top-3 right-5 px-3 py-1 bg-primary text-accent text-[10px] font-bold tracking-wider rounded-full shadow-sm uppercase flex items-center gap-1">
                          <Sparkles className="size-3" /> Mais escolhido
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5 mb-1.5">
                            <div className={`icon-chip size-9 ${isPopular ? "bg-accent text-accent-foreground" : "bg-primary/5 text-primary"}`}>
                              <Package className="size-4" />
                            </div>
                            <h3 className="font-bold text-xl tracking-tight">{pkg.name}</h3>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">{pkg.description}</p>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">R$</span>
                        <span className="text-5xl font-bold tracking-tight tabular-nums leading-none">{pkg.price}</span>
                        <span className="text-sm font-medium text-muted-foreground">/mês</span>
                      </div>
                      <div className="divider-soft" />
                      <div className="space-y-2.5 text-sm font-medium">
                        <div className="flex items-center gap-2.5">
                          <div className="size-5 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                            <CheckCircle2 className="size-3.5" />
                          </div>
                          <span><span className="tabular-nums font-bold">{pkg.searches_limit}</span> buscas mensais</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="size-5 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                            <CheckCircle2 className="size-3.5" />
                          </div>
                          <span>Exportação em CSV</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="size-5 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                            <CheckCircle2 className="size-3.5" />
                          </div>
                          <span>Suporte por e-mail</span>
                        </div>
                      </div>
                      <Button
                        size="lg"
                        className={`w-full mt-1 ${isCurrent ? "" : "btn-volt"}`}
                        disabled={isCurrent || purchasingId === pkg.id}
                        variant={isCurrent ? "secondary" : "default"}
                        onClick={() => !isCurrent && handleBuyPackage(pkg)}
                      >
                        {isCurrent
                          ? "Plano Atual"
                          : purchasingId === pkg.id
                            ? "Redirecionando..."
                            : "Comprar pacote"}
                      </Button>
                    </div>
                  );
                })}
                </div>
              </div>
            )}

            {activeTab === "purchases" && <PurchasesHistory />}

            {activeTab === "addons" && (
              <AddonsMarketplace
                paymentMode={paymentMode}
                onOpenAddon={(slug) => {
                  if (slug === "whatsapp") setActiveTab("addon-whatsapp");
                  if (slug === "whatsapp_crm") setActiveTab("addon-crm");
                  if (slug === "email_marketing") setActiveTab("addon-email");
                }}
              />
            )}

            {activeTab === "addon-whatsapp" && <WhatsAppAddon />}
            {activeTab === "addon-crm" && <WhatsAppCrmAddon />}
            {activeTab === "addon-email" && <EmailMarketingAddon />}

            {activeTab === "admin" && isAdmin && (
              <Tabs defaultValue="users" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-10 h-auto p-1.5 bg-muted/60 border border-border/60 rounded-xl mb-6">
                  <TabsTrigger value="users" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg font-semibold">
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">Usuários</span>
                  </TabsTrigger>
                  <TabsTrigger value="packages" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg font-semibold">
                    <Package className="w-4 h-4" />
                    <span className="hidden sm:inline">Pacotes</span>
                  </TabsTrigger>
                  <TabsTrigger value="addons" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg font-semibold">
                    <Puzzle className="w-4 h-4" />
                    <span className="hidden sm:inline">Add-ons</span>
                  </TabsTrigger>
                  <TabsTrigger value="apis" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg font-semibold">
                    <KeyRound className="w-4 h-4" />
                    <span className="hidden sm:inline">APIs</span>
                  </TabsTrigger>
                  <TabsTrigger value="ai" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg font-semibold">
                    <Bot className="w-4 h-4" />
                    <span className="hidden sm:inline">IA</span>
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg font-semibold">
                    <CreditCard className="w-4 h-4" />
                    <span className="hidden sm:inline">Pagamentos</span>
                  </TabsTrigger>
                  <TabsTrigger value="whatsapp" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg font-semibold">
                    <MessageCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">WhatsApp</span>
                  </TabsTrigger>
                  <TabsTrigger value="email-oauth" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg font-semibold">
                    <Mail className="w-4 h-4" />
                    <span className="hidden sm:inline">E-mail OAuth</span>
                  </TabsTrigger>
                  <TabsTrigger value="history" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg font-semibold">
                    <History className="w-4 h-4" />
                    <span className="hidden sm:inline">Histórico</span>
                  </TabsTrigger>
                  <TabsTrigger value="errors" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="hidden sm:inline">Erros</span>
                  </TabsTrigger>
                  <TabsTrigger value="export" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg font-semibold">
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Exportar</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Gerenciar Usuários
                      </CardTitle>
                      <CardDescription>
                        Visualize, edite permissões e gerencie os usuários da plataforma.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <UserManager />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="packages" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Package className="w-5 h-5" />
                        Pacotes de busca
                      </CardTitle>
                      <CardDescription>
                        Crie, edite e remova pacotes oferecidos aos usuários.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <PackagesManager />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="addons" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Puzzle className="w-5 h-5" />
                        Add-ons
                      </CardTitle>
                      <CardDescription>
                        Crie, edite, defina valores e especificações dos add-ons oferecidos aos usuários.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <AddonsManager />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="apis" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <KeyRound className="w-5 h-5" />
                        Configurações de APIs
                      </CardTitle>
                      <CardDescription>
                        Gerencie chaves, prioridades e fallback das integrações externas.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ApiConfigManager />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="ai" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Bot className="w-5 h-5" />
                        Prompt de Enriquecimento por IA
                      </CardTitle>
                      <CardDescription>
                        Configure como a IA deve pesquisar e estruturar os dados dos leads (redes sociais, e-mails, CNPJ, etc.).
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <AiPromptManager />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="payments" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5" />
                        Pagamentos — Mercado Pago
                      </CardTitle>
                      <CardDescription>
                        Configure as credenciais para emitir cobranças e receber confirmações.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <PaymentsConfig />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="whatsapp" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5" />
                        Evolution API (WhatsApp)
                      </CardTitle>
                      <CardDescription>
                        Configure o servidor da Evolution API usado pelo módulo de envio de WhatsApp.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <EvolutionApiConfig />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="email-oauth" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5" />
                        Credenciais OAuth — Gmail e Microsoft
                      </CardTitle>
                      <CardDescription>
                        Configure as credenciais que permitem aos clientes conectar suas contas Gmail e Outlook/Hotmail no add-on Email Marketing.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <EmailOAuthConfig />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <History className="w-5 h-5" />
                        Histórico de fontes
                      </CardTitle>
                      <CardDescription>
                        Acompanhe quais APIs foram usadas em cada busca recente.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <SourceHistory />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="errors" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Logs de erros das APIs
                      </CardTitle>
                      <CardDescription>
                        Falhas registradas das integrações para diagnóstico rápido.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ApiErrorLogs keyName="GOOGLE_MAPS_API_KEY" />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="export" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Download className="w-5 h-5" />
                        Exportar dados do sistema (SQL)
                      </CardTitle>
                      <CardDescription>
                        Gera um arquivo <code>.sql</code> com <code>INSERT</code>s de todas as tabelas de dados do sistema para backup ou migração.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DataExport />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function ShieldBadgeIcon() {
  return <Sparkles className="size-3 mr-1" />;
}
