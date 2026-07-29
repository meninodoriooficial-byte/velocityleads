import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, QrCode, CheckCircle2, Smartphone, Wifi, RefreshCw, AlertCircle } from "lucide-react";

type Phase = "creating" | "preparing" | "qr" | "connected" | "error";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}

const steps = [
  { key: "creating", label: "Criando a sessão", icon: Smartphone },
  { key: "preparing", label: "Preparando o QR Code", icon: QrCode },
  { key: "qr", label: "Escaneie com seu WhatsApp", icon: Wifi },
];

export const WhatsAppConnectDialog = ({ open, onOpenChange, onConnected }: Props) => {
  const [phase, setPhase] = useState<Phase>("creating");
  const [qr, setQr] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const qrPollRef = useRef<number | null>(null);
  const statusPollRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const clearTimers = () => {
    if (qrPollRef.current !== null) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
    if (statusPollRef.current !== null) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
  };

  const requestQr = async (action: "create" | "connect") => {
    const { data, error } = await supabase.functions.invoke("whatsapp-user", {
      body: action === "create" ? { action: "create" } : { action: "connect" },
    });
    if (error || !data?.ok) {
      return { qr: null as string | null, connected: false, err: data?.error || error?.message || "Falha ao criar sessão" };
    }
    if (data.state === "open" || data.connected) return { qr: null, connected: true, err: "" };
    const q = typeof data.qr === "string" && data.qr.length > 20 ? data.qr : null;
    return { qr: q, connected: false, err: "" };
  };

  const begin = async () => {
    clearTimers();
    setQr(null);
    setErrorMsg("");
    setPhase("creating");

    const first = await requestQr("create");
    if (first.connected) { setPhase("connected"); return; }
    if (first.err) { setErrorMsg(first.err); setPhase("error"); return; }

    if (first.qr) {
      setQr(first.qr);
      setPhase("qr");
    } else {
      setPhase("preparing");
      let attempts = 0;
      qrPollRef.current = window.setInterval(async () => {
        attempts++;
        const res = await requestQr("connect");
        if (res.connected) { clearTimers(); setPhase("connected"); return; }
        if (res.qr) {
          setQr(res.qr);
          setPhase("qr");
          if (qrPollRef.current !== null) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
        } else if (attempts >= 12) {
          clearTimers();
          setErrorMsg("O servidor de WhatsApp não gerou o QR Code. Tente novamente em instantes.");
          setPhase("error");
        }
      }, 3000);
    }

    statusPollRef.current = window.setInterval(async () => {
      const { data } = await supabase.functions.invoke("whatsapp-user", { body: { action: "status" } });
      if (data?.connected || data?.state === "open") {
        clearTimers();
        setPhase("connected");
      }
    }, 3000);
  };

  useEffect(() => {
    if (open && !startedRef.current) {
      startedRef.current = true;
      begin();
    }
    if (!open) {
      startedRef.current = false;
      clearTimers();
      setPhase("creating");
      setQr(null);
      setErrorMsg("");
    }
    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (phase === "connected") {
      const t = setTimeout(() => { onConnected(); onOpenChange(false); }, 1800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const activeIndex = phase === "creating" ? 0 : phase === "preparing" ? 1 : 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5 text-green-600" /> Conectar WhatsApp
          </DialogTitle>
          <DialogDescription>
            {phase === "connected"
              ? "Tudo pronto!"
              : phase === "error"
                ? "Não foi possível gerar o QR agora."
                : "Aguarde enquanto preparamos sua conexão."}
          </DialogDescription>
        </DialogHeader>

        {phase !== "connected" && phase !== "error" && (
          <div className="flex items-center justify-between px-2 py-4">
            {steps.map((s, i) => {
              const done = i < activeIndex;
              const current = i === activeIndex;
              const Icon = s.icon;
              return (
                <div key={s.key} className="flex flex-col items-center gap-2 flex-1 relative">
                  {i > 0 && (
                    <span className={`absolute top-5 right-1/2 w-full h-0.5 -z-0 ${done || current ? "bg-green-500" : "bg-border"}`} />
                  )}
                  <div className={`relative z-10 size-10 rounded-full flex items-center justify-center transition-all ${
                    done ? "bg-green-500 text-white" : current ? "bg-green-600/15 text-green-600 ring-2 ring-green-500" : "bg-muted text-muted-foreground"
                  }`}>
                    {done ? <CheckCircle2 className="size-5" /> : current ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
                  </div>
                  <span className={`text-[11px] text-center leading-tight ${current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col items-center justify-center min-h-[280px]">
          {(phase === "creating" || phase === "preparing") && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <div className="size-24 rounded-2xl bg-green-600/10 flex items-center justify-center">
                  <QrCode className="size-12 text-green-600/40" />
                </div>
                <Loader2 className="absolute -bottom-2 -right-2 size-8 text-green-600 animate-spin bg-card rounded-full p-1" />
              </div>
              <p className="text-sm text-muted-foreground max-w-[260px]">
                {phase === "creating" ? "Criando a sessão no servidor de WhatsApp..." : "Sessão criada! Gerando o QR Code para você escanear..."}
              </p>
            </div>
          )}

          {phase === "qr" && qr && (
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              <div className="rounded-xl border-2 border-green-500/30 p-3 bg-white">
                <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR Code do WhatsApp" className="size-56" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold">Escaneie com seu WhatsApp</p>
                <p className="text-xs text-muted-foreground max-w-[280px]">
                  Abra o WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> e aponte para o código.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-green-600">
                <Loader2 className="size-3 animate-spin" /> Aguardando leitura...
              </div>
            </div>
          )}

          {phase === "connected" && (
            <div className="flex flex-col items-center gap-4 text-center animate-fade-in">
              <div className="size-24 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle2 className="size-14 text-green-500" />
              </div>
              <div>
                <p className="font-bold text-lg">WhatsApp conectado!</p>
                <p className="text-sm text-muted-foreground">Já pode enviar mensagens aos seus leads.</p>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="size-20 rounded-full bg-amber-500/15 flex items-center justify-center">
                <AlertCircle className="size-10 text-amber-500" />
              </div>
              <p className="text-sm text-muted-foreground max-w-[280px]">{errorMsg}</p>
              <Button onClick={begin} variant="outline">
                <RefreshCw className="size-4 mr-2" /> Tentar novamente
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
