import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Key, Save, Plus, Trash2, Eye, EyeOff } from "lucide-react";

interface ApiConfig {
  id: string;
  key_name: string;
  display_name: string;
  description: string | null;
  api_key: string | null;
  is_active: boolean;
}

export const ApiConfigManager = () => {
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, Partial<ApiConfig>>>({});
  const [newConfig, setNewConfig] = useState({ key_name: "", display_name: "", description: "", api_key: "" });
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
      .order("display_name");
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

  const saveConfig = async (config: ApiConfig) => {
    setSavingId(config.id);
    const updates = editing[config.id];
    if (!updates) {
      setSavingId(null);
      return;
    }
    const { error } = await supabase
      .from("api_configs")
      .update(updates)
      .eq("id", config.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "API atualizada", description: `${config.display_name} foi salva com sucesso.` });
      setEditing((prev) => {
        const next = { ...prev };
        delete next[config.id];
        return next;
      });
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
    });
    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "API adicionada" });
      setNewConfig({ key_name: "", display_name: "", description: "", api_key: "" });
      setShowAddForm(false);
      fetchConfigs();
    }
  };

  const toggleVisibility = (id: string) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
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
                  <div className="flex gap-2">
                    <Input
                      type={isVisible ? "text" : "password"}
                      value={(getValue(config, "api_key") as string) || ""}
                      onChange={(e) => updateField(config.id, "api_key", e.target.value)}
                      placeholder="Cole a chave aqui"
                    />
                    <Button variant="outline" size="icon" onClick={() => toggleVisibility(config.id)} type="button">
                      {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
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
                  <Button onClick={() => saveConfig(config)} disabled={!isDirty || savingId === config.id} size="sm">
                    <Save className="w-4 h-4 mr-2" />
                    {savingId === config.id ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
