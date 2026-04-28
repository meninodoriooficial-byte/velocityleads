import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Key, Save, Plus, Trash2, Eye, EyeOff, CheckCircle2, Pencil, X, Zap, AlertCircle, Loader2 } from "lucide-react";

interface ApiConfig {
  id: string;
  key_name: string;
  display_name: string;
  description: string | null;
  api_key: string | null;
  is_active: boolean;
  provider: string | null;
  priority: number;
}

export const ApiConfigManager = () => {
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, Partial<ApiConfig>>>({});
  const [editingKey, setEditingKey] = useState<Record<string, boolean>>({});
  const [savedId, setSavedId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; details?: string }>>({});
  const [newConfig, setNewConfig] = useState({ key_name: "", display_name: "", description: "", api_key: "" });
  const [newProvider, setNewProvider] = useState<string>("google_places");
  const [newPriority, setNewPriority] = useState<number>(100);
  const [showAddForm, setShowAddForm] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("api_configs")
      .select("*")
      .order("provider", { ascending: true })
      .order("priority", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar APIs", description: error.message, variant: "destructive" });
    } else {
      setConfigs(data || []);
    }
    setLoading(false);
  };

  const updateField = (id: string, field: keyof ApiConfig, value: any) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const getValue = (config: ApiConfig, field: keyof ApiConfig) => {
    return editing[config.id]?.[field] ?? config[field];
  };

  const maskKey = (key: string | null) => {
    if (!key) return "";
    if (key.length <= 8) return "••••••••";
    return `${"•".repeat(Math.max(8, key.length - 4))}${key.slice(-4)}`;
  };

  const validateKey = (key: string): string | null => {
    const trimmed = key.trim();
    if (!trimmed) return "A chave não pode estar vazia.";
    if (trimmed.length < 10) return "A chave parece muito curta (mínimo 10 caracteres).";
    if (trimmed.length > 500) return "A chave excede o tamanho máximo (500 caracteres).";
    if (/\s/.test(trimmed)) return "A chave não pode conter espaços.";
    return null;
  };

  const saveConfig = async (config: ApiConfig) => {
    const updates = editing[config.id];
    if (!updates) {
      return;
    }

    if (typeof updates.api_key === "string") {
      const err = validateKey(updates.api_key);
      if (err) {
        toast({ title: "Chave inválida", description: err, variant: "destructive" });
        return;
      }
      updates.api_key = updates.api_key.trim();
    }

    setSavingId(config.id);
    const { error } = await supabase
      .from("api_configs")
      .update(updates)
      .eq("id", config.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "✓ Chave salva com sucesso",
        description: `${config.display_name} foi atualizada e está pronta para uso.`,
      });
      setEditing((prev) => {
        const next = { ...prev };
        delete next[config.id];
        return next;
      });
      setEditingKey((prev) => ({ ...prev, [config.id]: false }));
      setVisibleKeys((prev) => ({ ...prev, [config.id]: false }));
      setSavedId(config.id);
      setTimeout(() => setSavedId((curr) => (curr === config.id ? null : curr)), 3000);
      fetchConfigs();
    }
    setSavingId(null);
  };

  const deleteConfig = async (id: string, name: string) => {
    if (!confirm(`Remover a API "${name}"?`)) return;
    const { error } = await supabase.from("api_configs").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "API removida" });
      fetchConfigs();
    }
  };

  const addConfig = async () => {
    if (!newConfig.key_name || !newConfig.display_name) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("api_configs").insert({
      key_name: newConfig.key_name.toUpperCase().replace(/\s+/g, "_"),
      display_name: newConfig.display_name,
      description: newConfig.description || null,
      api_key: newConfig.api_key || null,
      provider: newProvider || null,
      priority: Number.isFinite(newPriority) ? newPriority : 100,
    });
    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "API adicionada" });
      setNewConfig({ key_name: "", display_name: "", description: "", api_key: "" });
      setNewProvider("google_places");
      setNewPriority(100);
      setShowAddForm(false);
      fetchConfigs();
    }
  };

  const toggleVisibility = (id: string) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const startEditingKey = (id: string) => {
    setEditingKey((prev) => ({ ...prev, [id]: true }));
    updateField(id, "api_key", "");
  };

  const cancelEditingKey = (id: string) => {
    setEditingKey((prev) => ({ ...prev, [id]: false }));
    setEditing((prev) => {
      const next = { ...prev };
      if (next[id]) {
        const { api_key, ...rest } = next[id];
        if (Object.keys(rest).length === 0) delete next[id];
        else next[id] = rest;
      }
      return next;
    });
    setVisibleKeys((prev) => ({ ...prev, [id]: false }));
  };

  const testApi = async (config: ApiConfig) => {
    setTestingId(config.id);
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[config.id];
      return next;
    });
    try {
      const { data, error } = await supabase.functions.invoke("test-api", {
        body: { key_name: config.key_name },
      });
      if (error) throw error;
      const ok = !!data?.ok;
      const details = [
        data?.elapsed_ms != null ? `${data.elapsed_ms}ms` : null,
        data?.results_count != null ? `${data.results_count} resultados` : null,
        data?.google_status ? `status: ${data.google_status}` : null,
        data?.google_error ? `${data.google_error}` : null,
      ]
        .filter(Boolean)
        .join(" • ");

      setTestResults((prev) => ({
        ...prev,
        [config.id]: { ok, message: data?.message || (ok ? "Sucesso" : "Falha"), details },
      }));
      toast({
        title: ok ? "✓ API funcionando" : "Falha no teste",
        description: data?.message || "",
        variant: ok ? "default" : "destructive",
      });
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [config.id]: { ok: false, message: e.message || "Erro ao testar a API" },
      }));
      toast({ title: "Erro ao testar", description: e.message, variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  if (loading) {
    return <p className="text-center text-muted-foreground py-8">Carregando configurações...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Key className="w-5 h-5" />
            Chaves de API
          </h3>
          <p className="text-sm text-muted-foreground">
            Gerencie as chaves de APIs externas usadas pelo sistema.
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Nova API
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adicionar nova API</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome de exibição *</Label>
                <Input
                  value={newConfig.display_name}
                  onChange={(e) => setNewConfig({ ...newConfig, display_name: e.target.value })}
                  placeholder="Ex: Stripe API"
                />
              </div>
              <div>
                <Label>Identificador (KEY_NAME) *</Label>
                <Input
                  value={newConfig.key_name}
                  onChange={(e) => setNewConfig({ ...newConfig, key_name: e.target.value })}
                  placeholder="Ex: STRIPE_API_KEY"
                />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={newConfig.description}
                onChange={(e) => setNewConfig({ ...newConfig, description: e.target.value })}
                placeholder="Para que serve essa chave"
              />
            </div>
            <div>
              <Label>Chave (opcional)</Label>
              <Input
                type="password"
                value={newConfig.api_key}
                onChange={(e) => setNewConfig({ ...newConfig, api_key: e.target.value })}
                placeholder="Cole a chave aqui"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={addConfig} size="sm">Adicionar</Button>
              <Button onClick={() => setShowAddForm(false)} variant="outline" size="sm">Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {configs.map((config) => {
          const isDirty = !!editing[config.id];
          const isVisible = visibleKeys[config.id];
          const isEditingThisKey = !!editingKey[config.id];
          const justSaved = savedId === config.id;
          const testResult = testResults[config.id];
          const isTesting = testingId === config.id;
          return (
            <Card key={config.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {config.display_name}
                      <Badge variant={config.is_active ? "default" : "secondary"}>
                        {config.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                      {config.api_key && <Badge variant="outline">Configurada</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      <code className="text-xs">{config.key_name}</code>
                      {config.description && ` — ${config.description}`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!getValue(config, "is_active")}
                      onCheckedChange={(v) => updateField(config.id, "is_active", v)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Chave de API</Label>
                  {isEditingThisKey ? (
                    <div className="flex gap-2">
                      <Input
                        type={isVisible ? "text" : "password"}
                        value={(editing[config.id]?.api_key as string) ?? ""}
                        onChange={(e) => updateField(config.id, "api_key", e.target.value)}
                        placeholder="Cole a nova chave aqui"
                        autoFocus
                      />
                      <Button variant="outline" size="icon" onClick={() => toggleVisibility(config.id)} type="button" title={isVisible ? "Ocultar" : "Mostrar"}>
                        {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => cancelEditingKey(config.id)} type="button" title="Cancelar">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={config.api_key ? maskKey(config.api_key) : ""}
                        placeholder="Nenhuma chave configurada"
                        className="font-mono text-muted-foreground"
                      />
                      <Button variant="outline" size="sm" onClick={() => startEditingKey(config.id)} type="button">
                        <Pencil className="w-4 h-4 mr-2" />
                        {config.api_key ? "Alterar" : "Adicionar"}
                      </Button>
                    </div>
                  )}
                  {justSaved && (
                    <p className="text-xs text-green-600 flex items-center gap-1 mt-2">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Chave salva com segurança.
                    </p>
                  )}
                </div>
                {testResult && (
                  <div
                    className={`text-xs rounded-md p-2 flex items-start gap-2 ${
                      testResult.ok
                        ? "bg-green-500/10 text-green-700 dark:text-green-400"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{testResult.message}</p>
                      {testResult.details && (
                        <p className="opacity-80 mt-0.5">{testResult.details}</p>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteConfig(config.id, config.display_name)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remover
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testApi(config)}
                      disabled={isTesting || !config.api_key}
                      title={!config.api_key ? "Configure uma chave primeiro" : "Testar conexão com a API"}
                    >
                      {isTesting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4 mr-2" />
                      )}
                      {isTesting ? "Testando..." : "Testar API"}
                    </Button>
                    <Button onClick={() => saveConfig(config)} disabled={!isDirty || savingId === config.id} size="sm">
                      <Save className="w-4 h-4 mr-2" />
                      {savingId === config.id ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
