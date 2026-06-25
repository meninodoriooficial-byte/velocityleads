import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ExternalLink, CreditCard, ShieldCheck } from "lucide-react";

type ConfigRow = {
  id: string;
  key_name: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  api_key_last4: string | null;
  priority: number;
  provider: string | null;
};

type MpKey = {
  key_name: string;
  display_name: string;
  description: string;
  placeholder: string;
  env: "test" | "live" | "shared";
  group: "access_token" | "public_key" | "webhook";
};

const MP_KEYS: MpKey[] = [
  {
    key_name: "MERCADO_PAGO_ACCESS_TOKEN_TEST",
    display_name: "Access Token — Teste (sandbox)",
    description: "Token privado de TESTE. Começa com TEST-... Usado para validar o fluxo sem cobrar de verdade.",
    placeholder: "TEST-xxxxxxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxxx",
    env: "test",
    group: "access_token",
  },
  {
    key_name: "MERCADO_PAGO_ACCESS_TOKEN_LIVE",
    display_name: "Access Token — Produção",
    description: "Token privado de PRODUÇÃO. Começa com APP_USR-... Cobranças reais usam este token.",
    placeholder: "APP_USR-xxxxxxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxxx",
    env: "live",
    group: "access_token",
  },
  {
    key_name: "MERCADO_PAGO_PUBLIC_KEY_TEST",
    display_name: "Public Key — Teste",
    description: "Chave pública de TESTE usada no frontend (Checkout Pro/Brick). Começa com TEST-.",
    placeholder: "TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    env: "test",
    group: "public_key",
  },
  {
    key_name: "MERCADO_PAGO_PUBLIC_KEY_LIVE",
    display_name: "Public Key — Produção",
    description: "Chave pública de PRODUÇÃO usada no frontend. Começa com APP_USR-.",
    placeholder: "APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    env: "live",
    group: "public_key",
  },
  {
    key_name: "MERCADO_PAGO_WEBHOOK_SECRET",
    display_name: "Assinatura do Webhook (opcional)",
    description: "Segredo para validar a assinatura dos webhooks do Mercado Pago (campo 'Chave secreta' nas configurações de notificações).",
    placeholder: "Cole aqui a chave secreta de webhooks",
    env: "shared",
    group: "webhook",
  },
];

export function PaymentsConfig() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<Record<string, ConfigRow | null>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("api_configs")
      .select("*")
      .in("key_name", MP_KEYS.map((k) => k.key_name));
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const map: Record<string, ConfigRow | null> = {};
    for (const k of MP_KEYS) {
      map[k.key_name] = (data || []).find((r: any) => r.key_name === k.key_name) || null;
    }
    setConfigs(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const ensureRow = async (key: typeof MP_KEYS[number]): Promise<string> => {
    const existing = configs[key.key_name];
    if (existing) return existing.id;
    const { data, error } = await supabase
      .from("api_configs")
      .insert({
        key_name: key.key_name,
        display_name: key.display_name,
        description: key.description,
        provider: "mercado_pago",
        is_active: true,
        priority: 100,
      })
      .select()
      .single();
    if (error) throw error;
    return data.id;
  };

  const saveKey = async (key: typeof MP_KEYS[number]) => {
    const value = (values[key.key_name] || "").trim();
    if (!value) {
      toast({ title: "Informe um valor", description: "Cole a credencial antes de salvar.", variant: "destructive" });
      return;
    }
    setSavingKey(key.key_name);
    try {
      const id = await ensureRow(key);
      const { error } = await supabase.rpc("set_api_key", {
        _config_id: id,
        _plain_key: value,
      });
      if (error) throw error;
      toast({ title: "Credencial salva", description: `${key.display_name} foi atualizada com segurança.` });
      setValues((v) => ({ ...v, [key.key_name]: "" }));
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message || String(e), variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  const clearKey = async (key: typeof MP_KEYS[number]) => {
    const existing = configs[key.key_name];
    if (!existing) return;
    setSavingKey(key.key_name);
    try {
      const { error } = await supabase.rpc("set_api_key", {
        _config_id: existing.id,
        _plain_key: "",
      });
      if (error) throw error;
      toast({ title: "Credencial removida" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || String(e), variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-accent/30 bg-accent/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4" /> Mercado Pago — passo a passo
          </CardTitle>
          <CardDescription>
            Para receber pagamentos via Mercado Pago, gere as credenciais no painel de desenvolvedores e cole abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            <li>
              Acesse o{" "}
              <a
                href="https://www.mercadopago.com.br/developers/panel/app"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
              >
                painel de aplicações <ExternalLink className="size-3" />
              </a>{" "}
              e crie uma aplicação do tipo <strong>Pagamentos online</strong>.
            </li>
            <li>
              Em <strong>Credenciais</strong>, escolha <strong>Produção</strong> (ou <strong>Teste</strong> para sandbox).
            </li>
            <li>
              Copie o <strong>Access Token</strong> e a <strong>Public Key</strong> e cole nos campos abaixo.
            </li>
            <li>
              (Opcional) Em <strong>Webhooks</strong>, configure a URL de notificação e copie a <strong>chave secreta</strong>.
            </li>
          </ol>
          <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" />
            As credenciais são criptografadas no banco e só ficam acessíveis ao backend.
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : (
        <div className="space-y-6">
          {(["test", "live", "shared"] as const).map((envGroup) => {
            const items = MP_KEYS.filter((k) => k.env === envGroup);
            if (items.length === 0) return null;
            const titleMap = {
              test: { label: "Ambiente de Teste (sandbox)", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
              live: { label: "Ambiente de Produção", tone: "bg-success/10 text-success border-success/30" },
              shared: { label: "Configurações compartilhadas", tone: "bg-muted text-muted-foreground border-border" },
            } as const;
            return (
              <div key={envGroup} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={titleMap[envGroup].tone}>
                    {titleMap[envGroup].label}
                  </Badge>
                </div>
                {items.map((key) => {
            const cfg = configs[key.key_name];
            const last4 = cfg?.api_key_last4;
            return (
              <Card key={key.key_name}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-base">{key.display_name}</CardTitle>
                      <CardDescription className="mt-1">{key.description}</CardDescription>
                    </div>
                    {last4 ? (
                      <Badge variant="secondary" className="font-mono">
                        ••••{last4}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Não configurada</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor={`input-${key.key_name}`}>Nova credencial</Label>
                    <PasswordInput
                      id={`input-${key.key_name}`}
                      autoComplete="off"
                      placeholder={key.placeholder}
                      value={values[key.key_name] || ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [key.key_name]: e.target.value }))
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => saveKey(key)}
                      disabled={savingKey === key.key_name}
                    >
                      {savingKey === key.key_name && (
                        <Loader2 className="size-4 animate-spin mr-2" />
                      )}
                      Salvar
                    </Button>
                    {last4 && (
                      <Button
                        variant="ghost"
                        onClick={() => clearKey(key)}
                        disabled={savingKey === key.key_name}
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PaymentsConfig;