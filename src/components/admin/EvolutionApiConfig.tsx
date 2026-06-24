import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Save, Loader2, MessageCircle } from "lucide-react";
import { Zap, Send, CheckCircle2, AlertCircle, QrCode } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const SETTING_KEY = "evolution_api";

export const EvolutionApiConfig = () => {
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testInstance, setTestInstance] = useState("velocityleads");
  const [testNumber, setTestNumber] = useState("");
  const [testMessage, setTestMessage] = useState("Mensagem de teste do Velocity Leads ✅");
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string; qr?: string | null } | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const pollRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const { toast } = useToast();

  const stopPolling = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPollingConnection = (instance: string) => {
    stopPolling();
    setConnected(false);
    const startedAt = Date.now();
    pollRef.current = window.setInterval(async () => {
      // 3 minutos de janela
      if (Date.now() - startedAt > 3 * 60 * 1000) {
        stopPolling();
        return;
      }
      const { data } = await supabase.functions.invoke("evolution-test", {
        body: { action: "state", instance },
      });
      if (data?.connected) {
        stopPolling();
        setConnected(true);
        toast({ title: "✅ Conectado com sucesso", description: `Instância "${instance}" conectada ao WhatsApp.` });
      }
    }, 3000);
  };

  useEffect(() => () => stopPolling(), []);

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

  const testConnection = async () => {
    setTesting(true);
    setPingResult(null);
    const { data, error } = await supabase.functions.invoke("evolution-test", {
      body: { action: "ping" },
    });
    setTesting(false);
    if (error) {
      setPingResult({ ok: false, msg: error.message });
      return;
    }
    setPingResult({
      ok: !!data?.ok,
      msg: data?.ok
        ? `${data.message} • ${data.instances_count} instância(s) • ${data.elapsed_ms}ms`
        : data?.error || "Falha na conexão",
    });
  };

  const sendTest = async () => {
    const digits = testNumber.replace(/\D/g, "");
    if (!testInstance.trim()) {
      setSendResult({ ok: false, msg: "Informe o nome da instância" });
      return;
    }
    if (digits.length < 12 || digits.length > 13) {
      setSendResult({ ok: false, msg: "Número inválido. Use DDI+DDD+número, ex: 5511999999999" });
      return;
    }
    if (!testMessage.trim()) {
      setSendResult({ ok: false, msg: "Mensagem vazia" });
      return;
    }
    setSending(true);
    setSendResult(null);
    const { data, error } = await supabase.functions.invoke("evolution-test", {
      body: {
        action: "send",
        instance: testInstance,
        number: digits,
        message: testMessage,
      },
    });
    setSending(false);
    if (error) {
      setSendResult({ ok: false, msg: error.message });
      return;
    }
    setSendResult({
      ok: !!data?.ok,
      msg: data?.ok ? "✓ Mensagem enviada com sucesso" : data?.error || "Falha no envio",
    });
  };

  const createInstance = async () => {
    if (!testInstance.trim()) return;
    setCreating(true);
    setCreateResult(null);
    const { data, error } = await supabase.functions.invoke("evolution-test", {
      body: { action: "create", instance: testInstance.trim() },
    });
    setCreating(false);
    if (error) {
      setCreateResult({ ok: false, msg: error.message });
      return;
    }
    setCreateResult({
      ok: !!data?.ok,
      msg: data?.ok
        ? (data.already_exists ? "Instância já existia ✓" : "Instância criada ✓ — escaneie o QR na Evolution")
        : data?.error || "Falha ao criar instância",
      qr: data?.qr || null,
    });
    if (data?.ok) startPollingConnection(testInstance.trim());
  };

  const reconnectInstance = async () => {
    if (!testInstance.trim()) return;
    setReconnecting(true);
    setCreateResult(null);
    const { data, error } = await supabase.functions.invoke("evolution-test", {
      body: { action: "connect", instance: testInstance.trim() },
    });
    setReconnecting(false);
    if (error) {
      setCreateResult({ ok: false, msg: error.message });
      return;
    }
    setCreateResult({
      ok: !!data?.ok,
      msg: data?.ok
        ? (data.qr ? "Novo QR Code gerado ✓ — escaneie no WhatsApp" : "Solicitação enviada (sem QR retornado)")
        : data?.error || "Falha ao gerar QR Code",
      qr: data?.qr || null,
    });
    if (data?.ok) startPollingConnection(testInstance.trim());
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

      <div className="border-t border-border/60 pt-5 mt-6 space-y-4">
        <div>
          <h4 className="font-semibold text-sm mb-1">Testar conexão</h4>
          <p className="text-xs text-muted-foreground mb-2">
            Verifica se a URL e a API Key conseguem acessar o servidor Evolution.
          </p>
          <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
            Testar API
          </Button>
          {pingResult && (
            <div className={`mt-2 text-xs rounded-md p-2 flex items-start gap-2 ${pingResult.ok ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
              {pingResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{pingResult.msg}</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Enviar mensagem de teste</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome da instância</Label>
              <Input value={testInstance} onChange={(e) => setTestInstance(e.target.value)} placeholder="ex: admin_test" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Número (DDI+DDD+nº)</Label>
              <Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="5511999999999" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={createInstance} disabled={creating || !testInstance.trim()}>
              {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-2" />}
              Criar instância "{testInstance || "..."}"
            </Button>
            <Button variant="outline" size="sm" onClick={reconnectInstance} disabled={reconnecting || !testInstance.trim()}>
              {reconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
              Gerar novo QR Code
            </Button>
          </div>
          {createResult && (
              <div className={`mt-2 text-xs rounded-md p-2 flex items-start gap-2 ${createResult.ok ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
                {createResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                <div className="space-y-2">
                  <span>{createResult.msg}</span>
                  {createResult.qr && (
                    <img
                      src={createResult.qr.startsWith("data:") ? createResult.qr : `data:image/png;base64,${createResult.qr}`}
                      alt="QR Code"
                      className="w-48 h-48 rounded bg-white p-2"
                    />
                  )}
                </div>
              </div>
            )}
          <div className="space-y-1">
            <Label className="text-xs">Mensagem</Label>
            <Textarea rows={3} value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={sendTest} disabled={sending}>
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar teste
          </Button>
          {sendResult && (
            <div className={`mt-1 text-xs rounded-md p-2 flex items-start gap-2 ${sendResult.ok ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
              {sendResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{sendResult.msg}</span>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            A instância precisa já estar conectada na Evolution (com QR code escaneado).
          </p>
        </div>
      </div>
    </div>
  );
};