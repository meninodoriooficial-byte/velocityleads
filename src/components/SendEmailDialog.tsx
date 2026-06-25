import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Send, Mail } from "lucide-react";
import { renderTemplate, type LeadContext } from "@/lib/templateTags";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ExternalLink } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead: LeadContext & { id?: string };
  onSent?: () => void;
}

type Template = { id: string; name: string; subject: string; body_html: string; body_text: string };
type Account = { id: string; email: string; display_name: string | null; provider: string };

export function SendEmailDialog({ open, onOpenChange, lead, onSent }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tplId, setTplId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [gmailApiError, setGmailApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const [t, a] = await Promise.all([
        supabase.from("email_templates").select("id,name,subject,body_html,body_text").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }),
        supabase.from("email_accounts").select("id,email,display_name,provider").eq("user_id", user.id).eq("is_active", true).order("send_order"),
      ]);
      setTemplates(((t.data as any) || []) as Template[]);
      setAccounts(((a.data as any) || []) as Account[]);
      setAccountId(((a.data as any)?.[0]?.id) || "");
      setTplId(""); setSubject(""); setBodyHtml("");
    })();
  }, [open, user]);

  const applyTpl = (id: string) => {
    setTplId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(renderTemplate(t.subject || "", lead));
    setBodyHtml(renderTemplate(t.body_html || t.body_text || "", lead));
  };

  const send = async () => {
    if (!lead.email) { toast({ title: "E-mail ausente", variant: "destructive" }); return; }
    if (!subject.trim() || !bodyHtml.trim()) { toast({ title: "Preencha assunto e corpo", variant: "destructive" }); return; }
    if (!accountId) { toast({ title: "Nenhuma conta de envio", description: "Conecte uma conta em Email Marketing.", variant: "destructive" }); return; }
    setSending(true);
    setGmailApiError(null);
    const { data, error } = await supabase.functions.invoke("email-send-user", {
      body: {
        to: lead.email, subject, html: bodyHtml, text: bodyHtml.replace(/<[^>]+>/g, ""),
        lead_id: lead.id, template_id: tplId || null, account_id: accountId,
      },
    });
    setSending(false);
    if (error || !data?.ok) {
      // FunctionsHttpError: body real do 400 vem em error.context (Response)
      let serverMsg = data?.error as string | undefined;
      if (!serverMsg && (error as any)?.context?.json) {
        try { serverMsg = (await (error as any).context.json())?.error; } catch { /* ignore */ }
      }
      if (!serverMsg && (error as any)?.context?.text) {
        try {
          const t = await (error as any).context.text();
          try { serverMsg = JSON.parse(t)?.error || t; } catch { serverMsg = t; }
        } catch { /* ignore */ }
      }
      const msg = String(serverMsg || error?.message || "");
      if (/Mail service not enabled|gmail api|failedPrecondition/i.test(msg)) {
        setGmailApiError(msg);
        toast({ title: "Gmail API não ativada", description: "Ative a API no Google Cloud para enviar e-mails.", variant: "destructive" });
      } else {
        toast({ title: "Falha ao enviar e-mail", description: msg, variant: "destructive" });
      }
      return;
    }
    toast({ title: "✓ E-mail enviado", description: `Para ${lead.email}` });
    onSent?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4 text-primary" /> Enviar e-mail
          </DialogTitle>
          <DialogDescription>
            Para <b>{lead.nome || lead.email}</b> · {lead.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {gmailApiError && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Gmail API não está ativada</AlertTitle>
              <AlertDescription className="space-y-2">
                <p className="text-xs">
                  A conta Gmail conectada não consegue enviar porque a <b>Gmail API</b> não foi ativada
                  no projeto do Google Cloud das credenciais OAuth.
                </p>
                <ol className="text-xs list-decimal pl-4 space-y-1">
                  <li>Abra o link abaixo e selecione o <b>mesmo projeto</b> usado para criar o Client ID/Secret.</li>
                  <li>Clique em <b>Ativar</b> (Enable) e aguarde ~1 minuto.</li>
                  <li>Tente enviar novamente — não precisa reconectar a conta.</li>
                </ol>
                <a
                  href="https://console.cloud.google.com/apis/library/gmail.googleapis.com"
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs underline font-medium"
                >
                  Ativar Gmail API <ExternalLink className="size-3" />
                </a>
              </AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Conta de envio</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder={accounts.length ? "Selecione..." : "Nenhuma conta conectada"} /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.email} ({a.provider})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Template</Label>
              <Select value={tplId} onValueChange={applyTpl}>
                <SelectTrigger><SelectValue placeholder={templates.length ? "Selecione..." : "Nenhum template"} /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Assunto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Olá {{nome}}..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mensagem (HTML)</Label>
            <Textarea rows={9} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} placeholder="<p>Olá {{nome}},</p>..." className="font-mono text-xs" />
            <p className="text-[10px] text-muted-foreground">Variáveis do template são preenchidas automaticamente com os dados do lead.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button onClick={send} disabled={sending || !subject.trim() || !bodyHtml.trim()}>
            {sending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />} Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}