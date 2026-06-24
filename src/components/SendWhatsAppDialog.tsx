import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Send, MessageCircle } from "lucide-react";
import { renderTemplate, type LeadContext } from "@/lib/templateTags";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead: LeadContext & { id?: string };
}

type Template = { id: string; name: string; body: string };

export function SendWhatsAppDialog({ open, onOpenChange, lead }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplId, setTplId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    supabase.from("message_templates").select("id,name,body").eq("user_id", user.id).eq("is_active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => setTemplates((data || []) as any));
    setTplId(""); setMessage("");
  }, [open, user]);

  const applyTpl = (id: string) => {
    setTplId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setMessage(renderTemplate(t.body, lead));
  };

  const send = async () => {
    if (!lead.telefone) { toast({ title: "Telefone ausente", variant: "destructive" }); return; }
    if (!message.trim()) { toast({ title: "Mensagem vazia", variant: "destructive" }); return; }
    setSending(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-user", {
      body: { action: "send", phone: lead.telefone, message, lead_id: lead.id, template_id: tplId || null },
    });
    setSending(false);
    if (error || !data?.ok) {
      toast({ title: "Falha ao enviar", description: data?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "✓ Mensagem enviada" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="size-4 text-green-600" /> Enviar WhatsApp
          </DialogTitle>
          <DialogDescription>
            Para <b>{lead.nome || lead.telefone}</b> · {lead.telefone}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Template</Label>
            <Select value={tplId} onValueChange={applyTpl}>
              <SelectTrigger><SelectValue placeholder={templates.length ? "Selecione um template..." : "Nenhum template cadastrado"} /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mensagem</Label>
            <Textarea rows={7} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem ou escolha um template..." />
            <p className="text-[10px] text-muted-foreground">As variáveis do template foram preenchidas automaticamente com os dados do lead.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button onClick={send} disabled={sending || !message.trim()} className="bg-green-600 hover:bg-green-700 text-white">
            {sending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />} Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}