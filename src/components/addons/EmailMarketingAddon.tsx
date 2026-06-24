import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Mail, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Shuffle } from "lucide-react";

type Account = {
  id: string;
  provider: "gmail" | "outlook" | "smtp";
  email: string;
  display_name: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  smtp_secure: boolean;
  daily_limit: number;
  sent_today: number;
  send_order: number;
  is_active: boolean;
};

const MAX_ACCOUNTS = 5;

export const EmailMarketingAddon = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rotational, setRotational] = useState(true);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Account>>({
    provider: "smtp",
    smtp_port: 465,
    smtp_secure: true,
    daily_limit: 50,
  });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [a, s] = await Promise.all([
      supabase.from("email_accounts").select("*").eq("user_id", user.id).order("send_order"),
      supabase.from("email_marketing_settings").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    setAccounts(((a.data as any) || []) as Account[]);
    setRotational(s.data?.rotational ?? true);
    setLoading(false);
  };
  useEffect(() => { load(); }, [user?.id]);

  const saveSettings = async (next: boolean) => {
    if (!user) return;
    setRotational(next);
    await supabase.from("email_marketing_settings").upsert({ user_id: user.id, rotational: next });
  };

  const openNew = () => {
    if (accounts.length >= MAX_ACCOUNTS) {
      toast({ title: "Limite atingido", description: `Máximo de ${MAX_ACCOUNTS} contas.`, variant: "destructive" });
      return;
    }
    setForm({ provider: "smtp", smtp_port: 465, smtp_secure: true, daily_limit: 50 });
    setDlgOpen(true);
  };

  const saveAccount = async () => {
    if (!user) return;
    if (!form.email) { toast({ title: "Informe o e-mail", variant: "destructive" }); return; }
    if (form.provider === "smtp" && (!form.smtp_host || !form.smtp_pass)) {
      toast({ title: "Preencha host SMTP e senha", variant: "destructive" }); return;
    }
    setSaving(true);
    const nextOrder = (accounts.reduce((m, a) => Math.max(m, a.send_order), 0) || 0) + 1;
    const { error } = await supabase.from("email_accounts").insert({
      user_id: user.id,
      provider: form.provider as any,
      email: form.email!,
      display_name: form.display_name || null,
      smtp_host: form.smtp_host || null,
      smtp_port: form.smtp_port || null,
      smtp_user: form.smtp_user || form.email!,
      smtp_pass: form.smtp_pass || null,
      smtp_secure: form.smtp_secure ?? true,
      daily_limit: form.daily_limit || 50,
      send_order: nextOrder,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "✓ Conta adicionada" });
    setDlgOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("email_accounts").delete().eq("id", id);
    load();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= accounts.length) return;
    const a = accounts[idx], b = accounts[target];
    await Promise.all([
      supabase.from("email_accounts").update({ send_order: b.send_order }).eq("id", a.id),
      supabase.from("email_accounts").update({ send_order: a.send_order }).eq("id", b.id),
    ]);
    load();
  };

  const oauthSoon = (p: "gmail" | "outlook") => {
    toast({
      title: `Conectar ${p === "gmail" ? "Gmail" : "Outlook"}`,
      description: "OAuth está em ativação. Por enquanto use a opção SMTP (Gmail aceita senha de app; Outlook também).",
    });
  };

  if (loading) return <Card><CardContent className="p-6"><Loader2 className="size-5 animate-spin" /></CardContent></Card>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5 text-primary" /> Email Marketing — Contas de envio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/40 border border-border/60">
            <div className="flex items-center gap-3">
              <Shuffle className="size-5 text-primary" />
              <div>
                <p className="font-semibold">Envio rotacional</p>
                <p className="text-xs text-muted-foreground">
                  {rotational
                    ? "Distribui um e-mail por vez em cada conta, na ordem definida."
                    : "Usa sempre a primeira conta da ordem até atingir o limite diário."}
                </p>
              </div>
            </div>
            <Switch checked={rotational} onCheckedChange={saveSettings} />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {accounts.length} de {MAX_ACCOUNTS} contas configuradas
            </p>
            <Button onClick={openNew} disabled={accounts.length >= MAX_ACCOUNTS}>
              <Plus className="size-4 mr-2" /> Nova conta
            </Button>
          </div>

          {accounts.length === 0 ? (
            <div className="text-center p-8 border-2 border-dashed border-border/60 rounded-xl">
              <Mail className="size-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada. Adicione uma para começar a enviar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((a, idx) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card">
                  <div className="flex flex-col gap-1">
                    <Button size="icon-sm" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}>
                      <ArrowUp className="size-3" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => move(idx, 1)} disabled={idx === accounts.length - 1}>
                      <ArrowDown className="size-3" />
                    </Button>
                  </div>
                  <Badge variant="outline" className="uppercase">{a.provider}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{a.display_name || a.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{a.sent_today}/{a.daily_limit} hoje</p>
                    <p>Ordem #{a.send_order}</p>
                  </div>
                  <Button size="icon-sm" variant="ghost" onClick={() => remove(a.id)} title="Remover">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova conta de e-mail</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Button variant={form.provider === "gmail" ? "default" : "outline"} onClick={() => oauthSoon("gmail")}>Gmail</Button>
              <Button variant={form.provider === "outlook" ? "default" : "outline"} onClick={() => oauthSoon("outlook")}>Outlook</Button>
              <Button variant={form.provider === "smtp" ? "default" : "outline"} onClick={() => setForm({ ...form, provider: "smtp" })}>SMTP</Button>
            </div>
            <div className="space-y-1">
              <Label>E-mail *</Label>
              <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="seu@dominio.com" />
            </div>
            <div className="space-y-1">
              <Label>Nome de exibição</Label>
              <Input value={form.display_name || ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Sua Empresa" />
            </div>
            {form.provider === "smtp" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1 col-span-2">
                    <Label>Servidor SMTP *</Label>
                    <Input value={form.smtp_host || ""} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
                  </div>
                  <div className="space-y-1">
                    <Label>Porta</Label>
                    <Input type="number" value={form.smtp_port || 465} onChange={(e) => setForm({ ...form, smtp_port: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label>SSL/TLS</Label>
                    <Select value={String(form.smtp_secure)} onValueChange={(v) => setForm({ ...form, smtp_secure: v === "true" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Sim (465)</SelectItem>
                        <SelectItem value="false">Não (587)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Usuário</Label>
                  <Input value={form.smtp_user || ""} onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} placeholder="(geralmente o e-mail)" />
                </div>
                <div className="space-y-1">
                  <Label>Senha de app *</Label>
                  <Input type="password" value={form.smtp_pass || ""} onChange={(e) => setForm({ ...form, smtp_pass: e.target.value })} />
                  <p className="text-[10px] text-muted-foreground">No Gmail use uma "senha de app". No Outlook, gere em conta.live.com / Segurança.</p>
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>Limite diário de envios</Label>
              <Input type="number" min={1} max={2000} value={form.daily_limit || 50} onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={saveAccount} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailMarketingAddon;