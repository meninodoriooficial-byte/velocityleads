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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Mail, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Shuffle, FileText, Pencil, Eye, PlugZap } from "lucide-react";

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

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string;
  is_active: boolean;
};

const TEMPLATE_VARS = ["{{nome}}", "{{empresa}}", "{{email}}", "{{telefone}}", "{{cidade}}", "{{ramo}}", "{{website}}"];

export const EmailMarketingAddon = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rotational, setRotational] = useState(true);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState<Partial<Account>>({
    provider: "smtp",
    smtp_port: 465,
    smtp_secure: true,
    daily_limit: 50,
  });

  // templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [tplDlg, setTplDlg] = useState(false);
  const [tplPreview, setTplPreview] = useState<EmailTemplate | null>(null);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplForm, setTplForm] = useState<Partial<EmailTemplate>>({ is_active: true });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [a, s, t] = await Promise.all([
      supabase.from("email_accounts").select("*").eq("user_id", user.id).order("send_order"),
      supabase.from("email_marketing_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("email_templates").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    setAccounts(((a.data as any) || []) as Account[]);
    setRotational(s.data?.rotational ?? true);
    setTemplates(((t.data as any) || []) as EmailTemplate[]);
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

  const applyPreset = (p: "gmail" | "outlook" | "smtp") => {
    if (p === "gmail") {
      setForm((f) => ({ ...f, provider: "smtp", smtp_host: "smtp.gmail.com", smtp_port: 465, smtp_secure: true, smtp_user: f.smtp_user || f.email || "" }));
    } else if (p === "outlook") {
      setForm((f) => ({ ...f, provider: "smtp", smtp_host: "smtp.office365.com", smtp_port: 587, smtp_secure: false, smtp_user: f.smtp_user || f.email || "" }));
    } else {
      setForm((f) => ({ ...f, provider: "smtp" }));
    }
  };

  const testConnection = async () => {
    if (!form.smtp_host || !form.smtp_pass || !(form.smtp_user || form.email)) {
      toast({ title: "Preencha host, usuário/e-mail e senha", variant: "destructive" });
      return;
    }
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("email-smtp-test", {
      body: {
        host: form.smtp_host,
        port: form.smtp_port || 465,
        secure: form.smtp_secure ?? true,
        user: form.smtp_user || form.email,
        pass: form.smtp_pass,
        from: form.email,
        to: form.email,
      },
    });
    setTesting(false);
    if (error || !data?.ok) {
      toast({ title: "Falha no teste de conexão", description: data?.error || error?.message || "Erro desconhecido", variant: "destructive" });
      return;
    }
    toast({ title: "✓ Conexão OK", description: `E-mail de teste enviado para ${data.sent_to}` });
  };

  const openTplNew = () => {
    setTplForm({ name: "", subject: "", body_html: "", body_text: "", is_active: true });
    setTplDlg(true);
  };
  const openTplEdit = (t: EmailTemplate) => {
    setTplForm(t);
    setTplDlg(true);
  };
  const saveTpl = async () => {
    if (!user) return;
    if (!tplForm.name?.trim() || !tplForm.subject?.trim()) {
      toast({ title: "Preencha nome e assunto", variant: "destructive" }); return;
    }
    if (!tplForm.body_html?.trim() && !tplForm.body_text?.trim()) {
      toast({ title: "Preencha o corpo HTML ou texto", variant: "destructive" }); return;
    }
    setTplSaving(true);
    const payload = {
      user_id: user.id,
      name: tplForm.name!,
      subject: tplForm.subject!,
      body_html: tplForm.body_html || "",
      body_text: tplForm.body_text || "",
      is_active: tplForm.is_active ?? true,
    };
    const { error } = tplForm.id
      ? await supabase.from("email_templates").update(payload).eq("id", tplForm.id)
      : await supabase.from("email_templates").insert(payload);
    setTplSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: tplForm.id ? "✓ Template atualizado" : "✓ Template criado" });
    setTplDlg(false);
    load();
  };
  const removeTpl = async (id: string) => {
    await supabase.from("email_templates").delete().eq("id", id);
    load();
  };
  const insertVar = (v: string) => {
    setTplForm((f) => ({ ...f, body_html: (f.body_html || "") + " " + v }));
  };

  if (loading) return <Card><CardContent className="p-6"><Loader2 className="size-5 animate-spin" /></CardContent></Card>;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="accounts" className="w-full">
        <TabsList>
          <TabsTrigger value="accounts"><Mail className="size-4 mr-2" />Contas e envio</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="size-4 mr-2" />Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
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
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-5 text-primary" /> Templates de e-mail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{templates.length} template(s)</p>
                <Button onClick={openTplNew}><Plus className="size-4 mr-2" /> Novo template</Button>
              </div>
              {templates.length === 0 ? (
                <div className="text-center p-8 border-2 border-dashed border-border/60 rounded-xl">
                  <FileText className="size-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum template criado ainda.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{t.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                      </div>
                      <Badge variant={t.is_active ? "default" : "outline"}>{t.is_active ? "Ativo" : "Inativo"}</Badge>
                      <Button size="icon-sm" variant="ghost" onClick={() => setTplPreview(t)} title="Pré-visualizar"><Eye className="size-4" /></Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => openTplEdit(t)} title="Editar"><Pencil className="size-4" /></Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => removeTpl(t.id)} title="Remover"><Trash2 className="size-4 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova conta de e-mail</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Preencher automaticamente</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button type="button" variant="outline" onClick={() => applyPreset("gmail")}>Gmail</Button>
                <Button type="button" variant="outline" onClick={() => applyPreset("outlook")}>Outlook</Button>
                <Button type="button" variant="outline" onClick={() => applyPreset("smtp")}>SMTP genérico</Button>
              </div>
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
                  <p className="text-[10px] text-muted-foreground">
                    No Gmail é obrigatório usar uma <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Senha de App</a> (com verificação em 2 etapas ativada). No Outlook, gere em conta.live.com / Segurança.
                  </p>
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>Limite diário de envios</Label>
              <Input type="number" min={1} max={2000} value={form.daily_limit || 50} onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)} disabled={saving || testing}>Cancelar</Button>
            <Button type="button" variant="secondary" onClick={testConnection} disabled={testing || saving}>
              {testing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <PlugZap className="size-4 mr-2" />} Testar conexão
            </Button>
            <Button onClick={saveAccount} disabled={saving || testing}>
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tplDlg} onOpenChange={setTplDlg}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{tplForm.id ? "Editar template" : "Novo template"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={tplForm.name || ""} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} placeholder="Ex: Apresentação inicial" />
            </div>
            <div className="space-y-1">
              <Label>Assunto *</Label>
              <Input value={tplForm.subject || ""} onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })} placeholder="Olá {{nome}}, podemos ajudar a {{empresa}}?" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Variáveis disponíveis</Label>
              </div>
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARS.map((v) => (
                  <Button key={v} type="button" size="sm" variant="outline" onClick={() => insertVar(v)} className="h-7 text-xs font-mono">{v}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Corpo HTML</Label>
              <Textarea rows={8} value={tplForm.body_html || ""} onChange={(e) => setTplForm({ ...tplForm, body_html: e.target.value })} placeholder="<p>Olá {{nome}},</p><p>...</p>" className="font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <Label>Versão texto (fallback)</Label>
              <Textarea rows={4} value={tplForm.body_text || ""} onChange={(e) => setTplForm({ ...tplForm, body_text: e.target.value })} placeholder="Versão em texto puro para clientes de e-mail antigos" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={tplForm.is_active ?? true} onCheckedChange={(v) => setTplForm({ ...tplForm, is_active: v })} />
              <Label className="cursor-pointer">Template ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTplDlg(false)} disabled={tplSaving}>Cancelar</Button>
            <Button onClick={saveTpl} disabled={tplSaving}>
              {tplSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tplPreview} onOpenChange={(o) => !o && setTplPreview(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tplPreview?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Assunto</p>
              <p className="font-medium">{tplPreview?.subject}</p>
            </div>
            <div className="border border-border/60 rounded-lg p-4 bg-card">
              <div dangerouslySetInnerHTML={{ __html: tplPreview?.body_html || `<pre style="white-space:pre-wrap">${tplPreview?.body_text || ""}</pre>` }} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailMarketingAddon;