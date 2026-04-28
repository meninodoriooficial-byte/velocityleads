import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Key, Save, Plus, Trash2, CheckCircle2, Pencil, X, Zap, AlertCircle, Loader2, Lock } from "lucide-react";

interface ApiConfig {
  id: string;
  key_name: string;
  display_name: string;
  description: string | null;
  api_key_last4: string | null;
  is_active: boolean;
  provider: string | null;
  priority: number;
}

// Campos editáveis em api_configs (não inclui chave criptografada)
type EditableFields = Pick<ApiConfig, "display_name" | "description" | "is_active" | "provider" | "priority">;

export const ApiConfigManager = () => {
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Partial<EditableFields>>>({});
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
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
      .select("id, key_name, display_name, description, api_key_last4, is_active, provider, priority")
      .order("provider", { ascending: true })
      .order("priority", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar APIs", description: error.message, variant: "destructive" });
    } else {
      setConfigs((data as ApiConfig[]) || []);
    }
    setLoading(false);
  };

  const updateField = (id: string, field: keyof EditableFields, value: any) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const getValue = <K extends keyof EditableFields>(config: ApiConfig, field: K): EditableFields[K] => {
    return (editing[config.id]?.[field] ?? (config as any)[field]) as EditableFields[K];
  };

  const maskedPreview = (last4: string | null) =>
    last4 ? `••••••••••••${last4}` : "";

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
    const draftKey = keyDrafts[config.id];
    const isEditingThisKey = !!editingKey[config.id];

    if (!updates && !(isEditingThisKey && typeof draftKey === "string")) {
      return;
    }

    setSavingId(config.id);
    try {
      // 1. Salvar campos comuns (sem a chave) via UPDATE direto
      if (updates && Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from("api_configs")
          .update(updates)
          .eq("id", config.id);
        if (error) throw error;
      }

      // 2. Se houver nova chave, validar e gravar via RPC criptografada
      if (isEditingThisKey && typeof draftKey === "string") {
        const err = validateKey(draftKey);
        if (err) {
          toast({ title: "Chave inválida", description: err, variant: "destructive" });
          setSavingId(null);
          return;
        }
        const { error: rpcError } = await supabase.rpc("set_api_key", {
          _config_id: config.id,
          _plain_key: draftKey.trim(),
        });
        if (rpcError) throw rpcError;
      }

      toast({
        title: "✓ Configuração salva com segurança",
        description: `${config.display_name} foi atualizada${
          isEditingThisKey ? " e a chave foi criptografada no banco" : ""
        }.`,
      });

      setEditing((prev) => {
        const next = { ...prev };
        delete next[config.id];
        return next;
      });
      setKeyDrafts((prev) => {
        const next = { ...prev };
        delete next[config.id];
        return next;
      });
      setEditingKey((prev) => ({ ...prev, [config.id]: false }));
      setSavedId(config.id);
      setTimeout(() => setSavedId((curr) => (curr === config.id ? null : curr)), 3000);
      fetchConfigs();
    } catch (error: any) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
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
    if (newConfig.api_key) {
      const err = validateKey(newConfig.api_key);
      if (err) {
        toast({ title: "Chave inválida", description: err, variant: "destructive" });
        return;
      }
    }
    // 1. Criar o registro sem chave
    const { data: inserted, error } = await supabase
      .from("api_configs")
      .insert({
        key_name: newConfig.key_name.toUpperCase().replace(/\s+/g, "_"),
        display_name: newConfig.display_name,
        description: newConfig.description || null,
        provider: newProvider || null,
        priority: Number.isFinite(newPriority) ? newPriority : 100,
      })
      .select("id")
      .single();
    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
      return;
    }
    // 2. Se forneceu chave, criptografar via RPC
    if (newConfig.api_key && inserted) {
      const { error: rpcErr } = await supabase.rpc("set_api_key", {
        _config_id: inserted.id,
        _plain_key: newConfig.api_key.trim(),
      });
      if (rpcErr) {
        toast({
          title: "API criada, mas falhou ao salvar a chave",
          description: rpcErr.message,
          variant: "destructive",
        });
      }
    }
    toast({ title: "API adicionada com segurança" });
    setNewConfig({ key_name: "", display_name: "", description: "", api_key: "" });
    setNewProvider("google_places");
    setNewPriority(100);
    setShowAddForm(false);
    fetchConfigs();
  };

  const startEditingKey = (id: string) => {
    setEditingKey((prev) => ({ ...prev, [id]: true }));
    setKeyDrafts((prev) => ({ ...prev, [id]: "" }));
  };

  const cancelEditingKey = (id: string) => {
    setEditingKey((prev) => ({ ...prev, [id]: false }));
    setKeyDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Provider (grupo de fallback)</Label>
                <Input
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  placeholder="ex: google_places"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Chaves com o mesmo provider são tentadas em sequência.
                </p>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  value={newPriority}
                  onChange={(e) => setNewPriority(parseInt(e.target.value) || 100)}
                  placeholder="100"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Menor número = tentada primeiro.
                </p>
              </div>
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
                      {config.provider && (
                        <Badge variant="outline" className="font-mono text-xs">
                          {config.provider} #{config.priority}
                        </Badge>
                      )}
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Provider</Label>
                    <Input
                      value={(getValue(config, "provider") as string) ?? ""}
                      onChange={(e) => updateField(config.id, "provider", e.target.value || null)}
                      placeholder="ex: google_places"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Prioridade (fallback)</Label>
                    <Input
                      type="number"
                      value={(getValue(config, "priority") as number) ?? 100}
                      onChange={(e) => updateField(config.id, "priority", parseInt(e.target.value) || 100)}
                      className="h-8 text-sm"
                    />
                  </div>
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
