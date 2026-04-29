import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { SearchForm } from "@/components/SearchForm";
import { TrendingUp, Users, Sparkles, CheckCircle2, KeyRound, History, AlertTriangle, Package, CreditCard } from "lucide-react";
import { ResultsSection } from "@/components/ResultsSection";
import { ApiConfigManager } from "@/components/admin/ApiConfigManager";
import { ApiErrorLogs } from "@/components/admin/ApiErrorLogs";
import { SourceHistory } from "@/components/admin/SourceHistory";
import { AllUserResults } from "@/components/AllUserResults";
import { UserManager } from "@/components/admin/UserManager";
import { PackagesManager } from "@/components/admin/PackagesManager";
import { PaymentsConfig } from "@/components/admin/PaymentsConfig";
import { PurchasesHistory } from "@/components/PurchasesHistory";
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
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchUserSearches();
      fetchPackages();
    }
  }, [user]);

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
      if (error) throw error;
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
    admin: { title: "Painel administrativo", subtitle: "Gerencie usuários, APIs e configurações." },
  };
  const head = headlines[activeTab];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar active={activeTab} onChange={setActiveTab} isAdmin={isAdmin} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border flex items-center px-4 md:px-8 gap-4">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold truncate">{head.title}</h1>
            </div>
            {isAdmin && (
              <Badge className="bg-primary text-accent hover:bg-primary/90">
                <ShieldBadgeIcon /> ADMIN
              </Badge>
            )}
          </header>

          <main className="flex-1 px-4 md:px-10 py-8 max-w-7xl w-full mx-auto animate-fade-in">
            {/* Hero/heading */}
            <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">{head.title}</h2>
                <p className="text-muted-foreground font-medium text-pretty">{head.subtitle}</p>
              </div>
              {activeTab === "search" && (
                <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-card border border-border/60">
                  <div className="size-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Pace
                  </span>
                  <span className="text-sm font-bold tabular-nums">{profile?.searches_used || 0} buscas</span>
                </div>
              )}
            </div>

            {/* Stats */}
            {activeTab === "search" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                <div className="card-elevated p-6 flex flex-col justify-between min-h-[140px]">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-semibold text-muted-foreground">Volume de Buscas</span>
                    <Badge variant="secondary" className="text-[10px] font-bold">CICLO</Badge>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1.5 mb-3">
                      <span className="text-3xl font-bold tabular-nums tracking-tight">
                        {profile?.searches_used || 0}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground">
                        / {profile?.plan_searches_limit || 0}
                      </span>
                    </div>
                    <Progress value={usagePercentage} className="h-2" />
                  </div>
                </div>

                <div className="card-elevated p-6 flex flex-col justify-between min-h-[140px]">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-semibold text-muted-foreground">Total Histórico</span>
                    <span className="text-xs font-bold text-success bg-success/10 px-2 py-1 rounded-md flex items-center gap-1">
                      <TrendingUp className="size-3" /> ativo
                    </span>
                  </div>
                  <div>
                    <div className="text-3xl font-bold tabular-nums tracking-tight">{searches.length}</div>
                    <div className="text-sm font-medium text-muted-foreground mt-1">prospecções realizadas</div>
                  </div>
                </div>

                <div className="bg-primary text-primary-foreground p-6 rounded-2xl shadow-card flex flex-col justify-between min-h-[140px] relative overflow-hidden">
                  <div className="absolute -right-6 -top-6 size-32 border-[10px] border-accent/20 rounded-full" />
                  <div className="absolute -right-10 -bottom-10 size-32 border-[10px] border-accent/10 rounded-full" />
                  <div className="relative z-10 flex justify-between items-start">
                    <span className="text-sm font-medium text-primary-foreground/70">Plano Atual</span>
                    <span className="size-2 bg-accent rounded-full animate-pulse" />
                  </div>
                  <div className="relative z-10">
                    <div className="text-xl font-bold text-accent capitalize tracking-tight mb-1">
                      {profile?.plan || "Basic"}
                    </div>
                    <div className="text-sm font-medium text-primary-foreground/70">
                      {remaining} buscas restantes
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
                <div className="flex items-center justify-end gap-2 text-xs">
                  <span className="text-muted-foreground">Modo de pagamento:</span>
                  <button
                    onClick={() => setPaymentMode("test")}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${paymentMode === "test" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    Teste
                  </button>
                  <button
                    onClick={() => setPaymentMode("live")}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${paymentMode === "live" ? "bg-success/15 text-success" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    Produção
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {packages.map((pkg: any) => {
                  const isCurrent = pkg.name.toLowerCase() === profile?.plan;
                  return (
                    <div
                      key={pkg.id}
                      className={`card-elevated p-6 flex flex-col gap-4 relative ${
                        isCurrent ? "ring-2 ring-accent" : ""
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute -top-3 right-4 px-3 py-1 bg-accent text-accent-foreground text-xs font-bold rounded-full">
                          ATUAL
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-xl tracking-tight">{pkg.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold tracking-tight">R$ {pkg.price}</span>
                        <span className="text-sm font-medium text-muted-foreground">/mês</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <CheckCircle2 className="size-4 text-success" />
                        {pkg.searches_limit} buscas mensais
                      </div>
                      <Button
                        className={isCurrent ? "" : "btn-volt"}
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

            {activeTab === "admin" && isAdmin && (
              <Tabs defaultValue="users" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 h-auto p-1 bg-muted/50 mb-6">
                  <TabsTrigger value="users" className="gap-2 py-2.5">
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">Usuários</span>
                  </TabsTrigger>
                  <TabsTrigger value="packages" className="gap-2 py-2.5">
                    <Package className="w-4 h-4" />
                    <span className="hidden sm:inline">Pacotes</span>
                  </TabsTrigger>
                  <TabsTrigger value="apis" className="gap-2 py-2.5">
                    <KeyRound className="w-4 h-4" />
                    <span className="hidden sm:inline">APIs</span>
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="gap-2 py-2.5">
                    <CreditCard className="w-4 h-4" />
                    <span className="hidden sm:inline">Pagamentos</span>
                  </TabsTrigger>
                  <TabsTrigger value="history" className="gap-2 py-2.5">
                    <History className="w-4 h-4" />
                    <span className="hidden sm:inline">Histórico</span>
                  </TabsTrigger>
                  <TabsTrigger value="errors" className="gap-2 py-2.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="hidden sm:inline">Erros</span>
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
