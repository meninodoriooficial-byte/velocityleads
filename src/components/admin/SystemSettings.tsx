import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Settings2, Loader2 } from "lucide-react";

export const SystemSettings = () => {
  const [allowSimulated, setAllowSimulated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "allow_simulated_fallback")
        .maybeSingle();
      if (data) setAllowSimulated(!!data.setting_value);
      setLoading(false);
    })();
  }, []);

  const updateSetting = async (value: boolean) => {
    setSaving(true);
    setAllowSimulated(value);
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        {
          setting_key: "allow_simulated_fallback",
          setting_value: value,
          description:
            "Quando todas as chaves de API falharem, retornar dados simulados com aviso ao usuário",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" }
      );
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      setAllowSimulated(!value);
    } else {
      toast({
        title: "Configuração atualizada",
        description: value
          ? "Fallback simulado ATIVADO — buscas continuarão mesmo se todas as APIs falharem."
          : "Fallback simulado DESATIVADO — buscas falharão se todas as APIs falharem.",
      });
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="w-5 h-5" />
          Configurações de fallback
        </CardTitle>
        <CardDescription>
          Como o sistema deve se comportar quando todas as chaves de API ativas falharem.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando...
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <Label htmlFor="allow-simulated" className="text-sm font-medium">
                Permitir resultados simulados
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Quando ativado, se todas as chaves de API falharem o sistema retorna dados simulados
                com um aviso para o usuário, evitando que a busca falhe completamente. Quando
                desativado, a busca termina com erro.
              </p>
            </div>
            <Switch
              id="allow-simulated"
              checked={allowSimulated}
              disabled={saving}
              onCheckedChange={updateSetting}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};