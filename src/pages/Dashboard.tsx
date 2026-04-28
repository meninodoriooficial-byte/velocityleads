import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { SearchForm } from "@/components/SearchForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Package, Search, BarChart3, Users, MapPin } from "lucide-react";
import { ResultsSection } from "@/components/ResultsSection";
import { ApiConfigManager } from "@/components/admin/ApiConfigManager";
import { ApiErrorLogs } from "@/components/admin/ApiErrorLogs";

export default function Dashboard() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [searches, setSearches] = useState([]);
  const [packages, setPackages] = useState([]);
  const [activeTab, setActiveTab] = useState("search");
  const [selectedSearch, setSelectedSearch] = useState(null);
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

  const handleSearch = async (searchData: { category: string; state: string; city: string; neighborhood?: string }) => {
    if (!profile) return;

    if (profile.searches_used >= profile.plan_searches_limit) {
      toast({
        title: "Limite de buscas atingido",
        description: "Faça upgrade do seu plano para continuar buscando.",
        variant: "destructive",
      });
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

      if (functionError) throw functionError;

      toast({
        title: "Busca iniciada",
        description: "Sua busca está sendo processada.",
      });

      fetchUserSearches();
      setSelectedSearch(searchRecord);
      setActiveTab("results");

    } catch (error: any) {
      console.error('Error starting search:', error);
      toast({
        title: "Erro na busca",
        description: error.message || "Erro ao iniciar a busca",
        variant: "destructive",
      });
    }
  };

  const usagePercentage = profile ? (profile.searches_used / profile.plan_searches_limit) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Business Finder
            </h1>
            {isAdmin && <Badge className="bg-red-500">ADMIN</Badge>}
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              Olá, {profile?.full_name || user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Buscas Utilizadas</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {profile?.searches_used || 0} / {profile?.plan_searches_limit || 0}
              </div>
              <Progress value={usagePercentage} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Buscas</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{searches.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Plano Atual</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{profile?.plan || 'Basic'}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-5' : 'grid-cols-4'}`}>
            <TabsTrigger value="search">Nova Busca</TabsTrigger>
            <TabsTrigger value="results">Resultados</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="plans">Planos</TabsTrigger>
            {isAdmin && <TabsTrigger value="admin">Admin</TabsTrigger>}
          </TabsList>

          <TabsContent value="search">
            <SearchForm onSearch={handleSearch} selectedSearch={selectedSearch} />
          </TabsContent>

          <TabsContent value="results">
            {selectedSearch ? (
              <ResultsSection searchData={selectedSearch} />
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    Faça uma busca para ver os resultados aqui
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Buscas</CardTitle>
              </CardHeader>
              <CardContent>
                {searches.length > 0 ? (
                  <div className="space-y-4">
                    {searches.map((search: any) => (
                      <div key={search.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="font-medium">{search.search_query}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(search.created_at).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant={search.status === 'completed' ? 'default' : 'secondary'}>
                            {search.status}
                          </Badge>
                          {search.status === 'completed' && (
                            <Button size="sm" onClick={() => { setSelectedSearch(search); setActiveTab("results"); }}>
                              Ver Resultados
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground">Nenhuma busca realizada ainda</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plans">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {packages.map((pkg: any) => (
                <Card key={pkg.id} className={pkg.name.toLowerCase() === profile?.plan ? 'border-primary' : ''}>
                  <CardHeader>
                    <CardTitle>{pkg.name}</CardTitle>
                    <CardDescription>{pkg.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-4">
                      R$ {pkg.price}
                      <span className="text-sm font-normal text-muted-foreground">/mês</span>
                    </div>
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center">
                        <Search className="w-4 h-4 mr-2" />
                        {pkg.searches_limit} buscas por mês
                      </div>
                    </div>
                    <Button className="w-full" disabled={pkg.name.toLowerCase() === profile?.plan}>
                      {pkg.name.toLowerCase() === profile?.plan ? 'Plano Atual' : 'Fazer Upgrade'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="admin">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Configurações de Administrador
                  </CardTitle>
                  <CardDescription>Gerencie as chaves de APIs e integrações do sistema</CardDescription>
                </CardHeader>
                <CardContent>
                  <ApiConfigManager />
                </CardContent>
              </Card>
              <div className="mt-4">
                <ApiErrorLogs keyName="GOOGLE_MAPS_API_KEY" />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
