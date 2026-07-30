import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2,
  GripVertical,
  CheckCircle2,
  XCircle,
  BookOpen,
  ExternalLink,
  Search,
  Zap,
  RefreshCw,
} from "lucide-react";

interface Settings {
  id: string;
  is_enabled: boolean;
  version: string;
  description: string;
  auto_optimize_order: boolean;
  min_confidence_score: number;
  updated_at: string;
}

interface ProviderRow {
  id: string;
  slug: string;
  display_name: string;
  api_config_provider: string | null;
  docs_url: string | null;
  is_free: boolean;
  is_enabled: boolean;
  sort_order: number;
  avg_time_ms: number | null;
  total_queries: number;
  total_errors: number;
  last_used_at: string | null;
  estimated_cost_cents: number;
}

export const SmartCnpjDiscoveryManager = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [sharedConfigProviders, setSharedConfigProviders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; latencyMs: number }>>({});
  const [tutorialFor, setTutorialFor] = useState<ProviderRow | null>(null);
  const [draggedSlug, setDraggedSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: p }, { data: apiConfigs }] = await Promise.all([
      supabase.from("cnpj_discovery_settings").select("*").limit(1).maybeSingle(),
      supabase.from("cnpj_discovery_providers").select("*").order("sort_order", { ascending: true }),
      supabase.from("api_configs").select("provider, is_active").eq("is_active", true),
    ]);
    setSettings(s as Settings | null);
    setProviders((p as ProviderRow[]) || []);
    setSharedConfigProviders(new Set((apiConfigs || []).map((c: any) => c.provider).filter(Boolean)));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleAddon = async (enabled: boolean) => {
    if (!settings) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("cnpj_discovery_settings")
      .update({ is_enabled: enabled })
      .eq("id", settings.id);
    setSavingSettings(false);
    if (error) {
      toast.error("Erro ao atualizar status do add-on");
      return;
    }
    setSettings({ ...settings, is_enabled: enabled });
    toast.success(enabled ? "Smart CNPJ Discovery ativado" : "Smart CNPJ Discovery desativado");
  };

  const toggleAutoOptimize = async (enabled: boolean) => {
    if (!settings) return;
    const { error } = await supabase
      .from("cnpj_discovery_settings")
      .update({ auto_optimize_order: enabled })
      .eq("id", settings.id);
    if (error) {
      toast.error("Erro ao atualizar otimização automática");
      return;
    }
    setSettings({ ...settings, auto_optimize_order: enabled });
  };

  const updateMinScore = async (value: number) => {
    if (!settings) return;
    setSettings({ ...settings, min_confidence_score: value });
  };

  const saveMinScore = async () => {
    if (!settings) return;
    const { error } = await supabase
      .from("cnpj_discovery_settings")
      .update({ min_confidence_score: settings.min_confidence_score })
      .eq("id", settings.id);
    if (error) toast.error("Erro ao salvar score mínimo");
    else toast.success("Score mínimo salvo");
  };

  const toggleProviderEnabled = async (row: ProviderRow, enabled: boolean) => {
    const { error } = await supabase
      .from("cnpj_discovery_providers")
      .update({ is_enabled: enabled })
      .eq("id", row.id);
    if (error) {
      toast.error("Erro ao atualizar provider");
      return;
    }
    setProviders((prev) => prev.map((p) => (p.id === row.id ? { ...p, is_enabled: enabled } : p)));
  };

  const testConnection = async (row: ProviderRow) => {
    setTesting((prev) => ({ ...prev, [row.slug]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("cnpj-discovery-test-provider", {
        body: { slug: row.slug },
      });
      if (error) throw error;
      setTestResults((prev) => ({ ...prev, [row.slug]: data }));
      if (data.ok) toast.success(`${row.display_name}: conexão OK (${data.latencyMs}ms)`);
      else toast.error(`${row.display_name}: ${data.message}`);
    } catch (e: any) {
      toast.error(`Erro ao testar ${row.display_name}: ${e.message ?? e}`);
    } finally {
      setTesting((prev) => ({ ...prev, [row.slug]: false }));
    }
  };

  // -------------------------------------------------------------
  // Drag and drop (HTML5 nativo — sem dependência extra)
  // -------------------------------------------------------------
  const handleDrop = async (targetSlug: string) => {
    if (!draggedSlug || draggedSlug === targetSlug) return;

    const ordered = [...providers];
    const fromIdx = ordered.findIndex((p) => p.slug === draggedSlug);
    const toIdx = ordered.findIndex((p) => p.slug === targetSlug);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);

    // Reatribui sort_order em passos de 10 (deixa espaço para futuras inserções)
    const withNewOrder = ordered.map((p, i) => ({ ...p, sort_order: (i + 1) * 10 }));
    setProviders(withNewOrder);
    setDraggedSlug(null);

    const updates = withNewOrder.map((p) =>
      supabase.from("cnpj_discovery_providers").update({ sort_order: p.sort_order }).eq("id", p.id),
    );
    const results = await Promise.all(updates);
    if (results.some((r) => r.error)) {
      toast.error("Erro ao salvar nova ordem — recarregando");
      load();
    } else {
      toast.success("Ordem dos providers atualizada");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="geral">
        <TabsList>
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="ordem">Ordem dos Providers</TabsTrigger>
        </TabsList>

        {/* ================= ABA GERAL ================= */}
        <TabsContent value="geral" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="w-5 h-5" />
                    Smart CNPJ Discovery
                  </CardTitle>
                  <CardDescription className="mt-1">{settings?.description}</CardDescription>
                </div>
                <Badge variant={settings?.is_enabled ? "default" : "secondary"}>
                  {settings?.is_enabled ? "Ativo" : "Desativado"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Versão</span>
                  <p className="font-medium">{settings?.version}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Última atualização</span>
                  <p className="font-medium">
                    {settings?.updated_at ? new Date(settings.updated_at).toLocaleString("pt-BR") : "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <p className="font-medium">Ativar Smart CNPJ Discovery</p>
                  <p className="text-sm text-muted-foreground">
                    Quando desativado, o enriquecimento continua funcionando exatamente como hoje.
                  </p>
                </div>
                <Switch
                  checked={settings?.is_enabled ?? false}
                  onCheckedChange={toggleAddon}
                  disabled={savingSettings}
                />
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <p className="font-medium">Otimização automática da ordem</p>
                  <p className="text-sm text-muted-foreground">
                    Quando ativado, reorganiza os providers automaticamente por taxa de sucesso, tempo e custo.
                  </p>
                </div>
                <Switch checked={settings?.auto_optimize_order ?? false} onCheckedChange={toggleAutoOptimize} />
              </div>

              <div className="border-t pt-4">
                <Label className="mb-2 block">Confiança mínima para aceitar um CNPJ (0–100)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={settings?.min_confidence_score ?? 60}
                    onChange={(e) => updateMinScore(Number(e.target.value))}
                    className="w-24"
                  />
                  <Button size="sm" variant="outline" onClick={saveMinScore}>
                    Salvar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= ABA ORDEM DOS PROVIDERS ================= */}
        <TabsContent value="ordem" className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Arraste para reordenar. A busca segue exatamente esta sequência, com fallback automático.
            </p>
            <Button size="sm" variant="ghost" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
          </div>

          {providers.map((row) => {
            const hasSharedConfig = row.api_config_provider ? sharedConfigProviders.has(row.api_config_provider) : false;
            const result = testResults[row.slug];
            return (
              <Card
                key={row.slug}
                draggable
                onDragStart={() => setDraggedSlug(row.slug)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(row.slug)}
                className={`transition-opacity ${draggedSlug === row.slug ? "opacity-50" : ""}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{row.display_name}</span>
                        <Badge variant={row.is_free ? "secondary" : "outline"} className="text-xs">
                          {row.is_free ? "Gratuito" : "Pago"}
                        </Badge>
                        {row.api_config_provider && (
                          <Badge variant={hasSharedConfig ? "default" : "outline"} className="text-xs gap-1">
                            {hasSharedConfig ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" /> Utilizando configuração compartilhada
                              </>
                            ) : (
                              "Não configurada"
                            )}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        <span>{row.total_queries} consultas</span>
                        <span>{row.total_errors} erros</span>
                        <span>{row.avg_time_ms ? `${row.avg_time_ms}ms médio` : "sem histórico"}</span>
                        {row.last_used_at && (
                          <span>último uso: {new Date(row.last_used_at).toLocaleDateString("pt-BR")}</span>
                        )}
                      </div>
                      {result && (
                        <p className={`text-xs mt-1 flex items-center gap-1 ${result.ok ? "text-emerald-600" : "text-destructive"}`}>
                          {result.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {result.message} ({result.latencyMs}ms)
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {row.docs_url && (
                        <Button size="sm" variant="ghost" onClick={() => setTutorialFor(row)}>
                          <BookOpen className="w-4 h-4 mr-1" /> Como obter
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testConnection(row)}
                        disabled={testing[row.slug]}
                      >
                        {testing[row.slug] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Zap className="w-4 h-4 mr-1" />
                        )}
                        Testar conexão
                      </Button>
                      <Switch
                        checked={row.is_enabled}
                        onCheckedChange={(v) => toggleProviderEnabled(row, v)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* Mini tutorial "Como obter esta API" */}
      <Dialog open={!!tutorialFor} onOpenChange={(open) => !open && setTutorialFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Como obter: {tutorialFor?.display_name}</DialogTitle>
            <DialogDescription>
              {tutorialFor?.tutorial_markdown ||
                "Acesse o site oficial abaixo para criar sua conta, gerar a API key e depois configure-a em Configurações de APIs, usando o provider correspondente."}
            </DialogDescription>
          </DialogHeader>
          {tutorialFor?.docs_url && (
            <a
              href={tutorialFor.docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline underline-offset-2 text-sm"
            >
              Abrir documentação oficial <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
