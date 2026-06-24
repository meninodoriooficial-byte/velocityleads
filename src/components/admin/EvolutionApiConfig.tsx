import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Save, Loader2, MessageCircle } from "lucide-react";

const SETTING_KEY = "evolution_api";

export const EvolutionApiConfig = () => {
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", SETTING_KEY)
        .maybeSingle();
      if (error) {
        toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
      } else if (data?.setting_value) {
        const v: any = data.setting_value;
        setApiUrl(v.api_url || "");
        setApiKey(v.api_key || "");
      }
      setLoading(false);
    })();
  }, [toast]);

  const save = async () => {
    if (!apiUrl.trim() || !apiKey.trim()) {
      toast({ title: "Preencha URL e API Key", variant: "destructive" });
      return;
    }
    setSaving(true);
    const value = { api_url: apiUrl.trim().replace(/\/+$/, ""), api_key: apiKey.trim() };
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { setting_key: SETTING_KEY, setting_value: value, description: "Credenciais da Evolution API (WhatsApp)" },
        { onConflict: "setting_key" }
      );
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✓ Configuração salva" });
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
      </p>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/60">
        <MessageCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Configure o servidor da <strong>Evolution API</strong> que será usado para conectar os números
          WhatsApp dos usuários e enviar mensagens aos leads capturados.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="evo-url">URL da Evolution API</Label>
        <Input
          id="evo-url"
          placeholder="https://evolution.seudominio.com"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Endpoint base do seu servidor Evolution (sem barra no final).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="evo-key">API Key (global)</Label>
        <Input
          id="evo-key"
          type="password"
          placeholder="Cole a AUTHENTICATION_API_KEY do servidor"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Chave admin definida em <code>AUTHENTICATION_API_KEY</code> da Evolution. Usada apenas pelo backend.
        </p>
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Salvar configuração
      </Button>
    </div>
  );
};