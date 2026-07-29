import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserAddons } from "@/hooks/useUserAddons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { MessageCircle, QrCode, Loader2, CheckCircle2, AlertCircle, Power, FileText, History as HistoryIcon, Link2, Smartphone, Wifi, WifiOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageTemplatesManager } from "./MessageTemplatesManager";
import { MessageHistoryList } from "./MessageHistoryList";

export const WhatsAppAddon = () => {
  const { user } = useAuth();
  const { active, refresh } = useUserAddons();
  const addonState = active.find((a) => a.addon_slug === "whatsapp");
  const { toast } = useToast();

  const [instanceName, setInstanceName] = useState("");
  const [state, setState] = useState<string>("unknown");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<{ name?: string | null; picture?: string | null; number?: string | null } | null>(null);
  const pollRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const stopHeartbeat = () => {
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    // Mantém o status sincronizado com a Evolution a cada 25s
    // para o usuário não clicar em "Conectar" e derrubar a sessão.
    heartbeatRef.current = window.setInterval(() => { fetchStatus(); }, 25000);
  };

  const fetchStatus = async () => {
    const { data } = await supabase.functions.invoke("whatsapp-user", { body: { action: "status" } });
    if (data?.instance) setInstanceName(data.instance.instance_name);
    if (data?.state) setState(data.state);
    if (data?.profile) setProfile(data.profile); else if (!data?.connected) setProfile(null);
    if (data?.connected) {
      setQr(null);
      stopPolling();
    }
  };

  useEffect(() => {
    fetchStatus();
    startHeartbeat();
    return () => { stopPolling(); stopHeartbeat(); };
  }, []);

  const startPolling = () => {
    stopPolling();
    const t0 = Date.now();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - t0 > 3 * 60 * 1000) { stopPolling(); return; }
      const { data } = await supabase.functions.invoke("whatsapp-user", { body: { action: "status" } });
      if (data?.state) setState(data.state);
      if (data?.profile) setProfile(data.profile);
      if (data?.connected) {
        stopPolling();
        setQr(null);
        await fetchStatus();
        toast({ title: "✅ Conectado com sucesso", description: "Seu WhatsApp está pronto para enviar mensagens." });
      }
    }, 3000);
  };

  const createOrReconnect = async (action: "create" | "connect") => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-user", {
      body: action === "create"
        ? { action: "create", instance_name: instanceName || undefined }
        : { action: "connect" },
    });
    setBusy(false);
    if (error || !data?.ok) {
      toast({ title: "Erro", description: data?.error || error?.message, variant: "destructive" });
      return;
    }
    if (data.instance_name) setInstanceName(data.instance_name);
    if (typeof data.qr === "string" && data.qr.length > 20) {
      setQr(data.qr);
    } else {
      setQr(null);
      toast({
        title: "QR Code indisponível",
        description: "O servidor de WhatsApp não gerou o QR agora. Tente novamente em alguns instantes ou clique em 'Gerar novo QR Code'.",
      });
    }
    setState("connecting");
    startPolling();
    await fetchStatus();
  };

  if (!addonState) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Você ainda não tem o add-on WhatsApp ativo.
      </div>
    );
  }

  const used = addonState.monthly_used || 0;
  const quota = addonState.monthly_quota || 0;
  const pct = quota > 0 ? (used / quota) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* Header cota */}
      <div className="card-elevated p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-green-600/15 text-green-700 dark:text-green-400 flex items-center justify-center">
            <MessageCircle className="size-5" />
          </div>
          <div>
            <div className="font-bold flex items-center gap-2">
              WhatsApp Prospect
              <Badge className="bg-green-600 hover:bg-green-600 text-white">ATIVO</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {addonState.expires_at ? `Renova em ${new Date(addonState.expires_at).toLocaleDateString("pt-BR")}` : "Acesso vitalício"}
            </div>
          </div>
        </div>
        <div className="min-w-[220px] flex-1 max-w-sm">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-muted-foreground">Disparos no mês</span>
            <span className="tabular-nums font-bold">{used} / {quota || "—"}</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      </div>

      <Tabs defaultValue="connection">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="connection" className="gap-2"><Link2 className="size-4" /> Conexão</TabsTrigger>
          <TabsTrigger value="templates" className="gap-2"><FileText className="size-4" /> Templates</TabsTrigger>
          <TabsTrigger value="history" className="gap-2"><HistoryIcon className="size-4" /> Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="mt-5 space-y-4">
          {state === "open" && (
            <div className="relative overflow-hidden rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent p-5 shadow-[0_0_40px_-12px_hsl(142_70%_45%/0.35)]">
              <div className="absolute -right-12 -top-12 size-40 rounded-full bg-green-500/10 blur-3xl" />
              <div className="absolute -left-8 -bottom-8 size-32 rounded-full bg-emerald-500/10 blur-3xl" />
              <div className="relative flex items-center gap-4 flex-wrap">
                <div className="relative">
                  <Avatar className="size-20 ring-4 ring-green-500/40 shadow-lg">
                    {profile?.picture && <AvatarImage src={profile.picture} alt={profile?.name || "WhatsApp"} />}
                    <AvatarFallback className="bg-gradient-to-br from-green-500 to-emerald-600 text-white text-xl font-bold">
                      {(profile?.name || instanceName || "WA").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-1 -right-1 size-6 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
                    <CheckCircle2 className="size-3.5 text-white" />
                  </span>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400">
                      <Wifi className="size-3" /> Online
                    </span>
                    <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px]">Conectado</Badge>
                  </div>
                  <div className="text-lg font-bold leading-tight">{profile?.name || "WhatsApp conectado"}</div>
                  {profile?.number && (
                    <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Smartphone className="size-3.5" /> +{profile.number}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    Instância: <span className="font-mono">{instanceName}</span>
                  </div>
                </div>
                <Button onClick={fetchStatus} variant="ghost" size="sm" className="ml-auto">
                  Atualizar
                </Button>
              </div>
            </div>
          )}

          {state !== "open" && (
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-5 flex items-center gap-4">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center">
                <WifiOff className="size-7 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="font-bold">WhatsApp desconectado</div>
                <div className="text-sm text-muted-foreground">
                  {state === "connecting" ? "Aguardando leitura do QR Code..." : state === "not_found" ? "Crie sua instância para começar." : "Conecte para enviar mensagens aos leads."}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 max-w-md">
            <Label>Nome da sua instância</Label>
            <Input
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              placeholder={`user_${user?.id?.slice(0, 8) || "xxxxx"}`}
            />
            <p className="text-xs text-muted-foreground">Identifica seu WhatsApp no servidor. Letras minúsculas, números, _ ou -.</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary" className="capitalize">
              {state === "open" ? "✓ Conectado" : state === "connecting" ? "Conectando..." : state === "not_found" ? "Não criado" : state}
            </Badge>
            <Button onClick={() => createOrReconnect("create")} disabled={busy} variant="outline">
              {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Power className="size-4 mr-2" />}
              Criar / Conectar
            </Button>
            <Button onClick={() => createOrReconnect("connect")} disabled={busy || !instanceName} variant="outline">
              <QrCode className="size-4 mr-2" /> Gerar novo QR Code
            </Button>
            <Button onClick={fetchStatus} variant="ghost" size="sm">Atualizar status</Button>
          </div>

          {typeof qr === "string" && qr.length > 20 && (
            <div className="rounded-lg border border-border/60 p-4 bg-muted/30 inline-block">
              <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                <QrCode className="size-4" /> Escaneie no WhatsApp → Aparelhos conectados
              </p>
              <img
                src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                alt="QR Code"
                className="w-64 h-64 rounded bg-white p-3"
              />
              <p className="text-xs text-muted-foreground mt-2">O QR expira em ~40s. Gere outro se precisar.</p>
            </div>
          )}

          {state === "open" && (
            <div className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400 bg-green-500/10 rounded-md p-3">
              <CheckCircle2 className="size-4 mt-0.5" />
              <span>Seu WhatsApp está conectado. Você pode criar templates e enviar mensagens para seus leads.</span>
            </div>
          )}
          {state === "not_found" && (
            <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-md p-3">
              <AlertCircle className="size-4 mt-0.5" />
              <span>Sua instância ainda não foi criada. Clique em "Criar / Conectar" e escaneie o QR Code.</span>
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="mt-5">
          <MessageTemplatesManager />
        </TabsContent>

        <TabsContent value="history" className="mt-5">
          <MessageHistoryList />
        </TabsContent>
      </Tabs>
    </div>
  );
};