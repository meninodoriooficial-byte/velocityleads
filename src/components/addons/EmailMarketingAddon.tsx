import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/ui/password-input";
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Mail, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Shuffle, FileText, Pencil, Eye, PlugZap, AlertTriangle, Send } from "lucide-react";

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
  const [activePreset, setActivePreset] = useState<"gmail" | "smtp" | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState<"gmail" | null>(null);
  const [sendTestAcc, setSendTestAcc] = useState<Account | null>(null);
  const [sendTestTo, setSendTestTo] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
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
    setActivePreset(null);
    setDlgOpen(true);
  };

  const openEdit = (a: Account) => {
    setForm({ ...a });
    setDlgOpen(true);
  };

  const saveAccount = async () => {
    if (!user) return;
    if (!form.email) { toast({ title: "Informe o e-mail", variant: "destructive" }); return; }
    if (!form.smtp_host || !form.smtp_pass) {
      toast({ title: "Preencha host SMTP e senha", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload: any = {
      provider: form.provider as any,
      email: form.email!,
      display_name: form.display_name || null,
      smtp_host: form.smtp_host || null,
      smtp_port: form.smtp_port || null,
      smtp_user: form.smtp_user || form.email!,
      smtp_pass: form.smtp_pass || null,
      smtp_secure: form.smtp_secure ?? true,
      daily_limit: form.daily_limit || 50,
    };
    const { error } = form.id
      ? await supabase.from("email_accounts").update(payload).eq("id", form.id)
      : await supabase.from("email_accounts").insert({
          ...payload,
          user_id: user.id,
          send_order: (accounts.reduce((m, a) => Math.max(m, a.send_order), 0) || 0) + 1,
        });
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: form.id ? "✓ Conta atualizada" : "✓ Conta adicionada" });
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

  const applyPreset = (p: "gmail" | "smtp") => {
    setActivePreset(p);
    if (p === "gmail") {
      setForm((f) => ({ ...f, provider: "gmail", smtp_host: "smtp.gmail.com", smtp_port: 465, smtp_secure: true, smtp_user: f.smtp_user || f.email || "" }));
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
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 70000);
    try {
      const { data, error } = await supabase.functions.invoke("email-smtp-test", {
        body: {
          host: form.smtp_host,
          port: form.smtp_port || 465,
          secure: form.smtp_secure ?? true,
          user: form.smtp_user || form.email,
          pass: form.smtp_pass.trim().replace(/\s+/g, ""),
          from: form.email,
          to: form.email,
        },
        signal: controller.signal,
      });
      if (error || !data?.ok) {
        toast({ title: "Falha no teste de conexão", description: data?.error || error?.message || "Erro desconhecido", variant: "destructive" });
        return;
      }
      toast({ title: "✓ Conexão OK", description: `Login SMTP validado para ${data.sent_to}` });
    } catch (e) {
      toast({
        title: "Falha no teste de conexão",
        description: e instanceof DOMException && e.name === "AbortError"
          ? "O teste demorou demais e foi cancelado. Verifique host/porta e use smtp.office365.com na porta 587 com SSL desativado para Outlook."
          : (e as Error).message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      window.clearTimeout(timeout);
      setTesting(false);
    }
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
                  <Button size="icon-sm" variant="ghost" onClick={() => openEdit(a)} title="Editar">
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => { setSendTestAcc(a); setSendTestTo(a.email); }} title="Enviar e-mail de teste">
                    <Send className="size-4 text-primary" />
                  </Button>
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
                <Button type="button" variant="outline" onClick={() => applyPreset("gmail")} className={activePreset === "gmail" ? "bg-green-600 text-white border-green-600 hover:bg-green-700 hover:text-white" : ""}>Gmail</Button>
                <Button type="button" variant="outline" onClick={() => applyPreset("outlook")} className={activePreset === "outlook" ? "bg-green-600 text-white border-green-600 hover:bg-green-700 hover:text-white" : ""}>Outlook</Button>
                <Button type="button" variant="outline" onClick={() => applyPreset("smtp")} className={activePreset === "smtp" ? "bg-green-600 text-white border-green-600 hover:bg-green-700 hover:text-white" : ""}>SMTP genérico</Button>
              </div>
            </div>
            {(activePreset === "gmail" || activePreset === "outlook") && (
              <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => setTutorialOpen(activePreset)}>
                📘 Ver tutorial: como obter a Senha de App {activePreset === "gmail" ? "do Gmail" : "do Outlook"}
              </Button>
            )}
            <div className="space-y-1">
              <Label>E-mail *</Label>
              <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="seu@dominio.com" />
            </div>
            <div className="space-y-1">
              <Label>Nome de exibição</Label>
              <Input value={form.display_name || ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Sua Empresa" />
            </div>
            {(form.provider === "smtp" || form.provider === "gmail" || form.provider === "outlook") && (
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
                <div className="space-y-2">
                  <Label>Senha de app *</Label>
                  <PasswordInput value={form.smtp_pass || ""} onChange={(e) => setForm({ ...form, smtp_pass: e.target.value })} />
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                    <AlertTriangle className="size-4 mt-0.5 shrink-0 text-amber-400" />
                    <p className="leading-relaxed">
                      <strong className="font-semibold">Atenção:</strong> no Gmail é <strong>obrigatório</strong> usar uma{" "}
                      <a className="underline font-semibold" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
                        Senha de App
                      </a>{" "}
                      (com verificação em 2 etapas ativada). No Outlook, gere em{" "}
                      <a className="underline font-semibold" href="https://account.live.com/proofs/Manage" target="_blank" rel="noreferrer">
                        conta.live.com / Segurança
                      </a>.
                    </p>
                  </div>
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

      <Dialog open={tutorialOpen !== null} onOpenChange={(o) => !o && setTutorialOpen(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {tutorialOpen === "gmail" ? "📘 Senha de App — Gmail" : "📘 Senha de App — Outlook / Hotmail"}
            </DialogTitle>
          </DialogHeader>
          {tutorialOpen === "gmail" && (
            <div className="space-y-3 text-sm leading-relaxed">
              <ol className="list-decimal pl-5 space-y-2">
                <li>Acesse <a className="underline text-primary" href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">myaccount.google.com/security</a>.</li>
                <li>Ative a <strong>Verificação em duas etapas</strong> (obrigatório). Sem ela o Google não libera Senha de App.</li>
                <li>Depois, acesse <a className="underline text-primary" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a>.</li>
                <li>Em "Nome do app" digite algo como <em>"Lead SaaS"</em> e clique em <strong>Criar</strong>.</li>
                <li>O Google mostrará uma senha de <strong>16 caracteres</strong> (ex.: <code>abcd efgh ijkl mnop</code>).</li>
                <li>Copie e cole no campo <strong>Senha de app</strong> do formulário (espaços são removidos automaticamente).</li>
                <li>Servidor: <code>smtp.gmail.com</code> · Porta: <code>465</code> · SSL: <strong>Sim</strong>.</li>
              </ol>
              <p className="text-xs text-muted-foreground">⚠️ Se não aparecer "Senhas de app", confirme a 2FA ativa e que não é conta Google Workspace com restrição.</p>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setTutorialOpen(null)}>Fechar</Button>
                <Button asChild>
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Gerar Senha de App ↗</a>
                </Button>
              </DialogFooter>
            </div>
          )}
          {tutorialOpen === "outlook" && (
            <div className="space-y-3 text-sm leading-relaxed">
              <ol className="list-decimal pl-5 space-y-2">
                <li>Acesse <a className="underline text-primary" href="https://account.live.com/proofs/Manage" target="_blank" rel="noreferrer">account.live.com/proofs/Manage</a>.</li>
                <li>Ative a <strong>Verificação em duas etapas</strong>. Sem isso a Microsoft bloqueia SMTP.</li>
                <li>Em seguida, acesse <a className="underline text-primary" href="https://account.live.com/proofs/AppPassword" target="_blank" rel="noreferrer">account.live.com/proofs/AppPassword</a>.</li>
                <li>Clique em <strong>Criar uma nova senha de app</strong>.</li>
                <li>A Microsoft mostrará uma senha de <strong>16 caracteres</strong> sem espaços.</li>
                <li>Copie e cole no campo <strong>Senha de app</strong> do formulário.</li>
                <li>Servidor: <code>smtp-mail.outlook.com</code> · Porta: <code>587</code> · SSL: <strong>Não</strong> (STARTTLS).</li>
                <li>Microsoft 365 corporativo: use <code>smtp.office365.com</code> e peça ao admin para liberar SMTP AUTH.</li>
              </ol>
              <p className="text-xs text-muted-foreground">⚠️ Erro <code>535 5.7.3 Authentication unsuccessful</code> = senha usada não é Senha de App ou a 2FA não está ativa.</p>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setTutorialOpen(null)}>Fechar</Button>
                <Button asChild>
                  <a href="https://account.live.com/proofs/AppPassword" target="_blank" rel="noreferrer">Gerar Senha de App ↗</a>
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={outlookWarnOpen} onOpenChange={setOutlookWarnOpen}>
        <DialogContent className="sm:max-w-md z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="size-5" /> SMTP do Outlook está bloqueado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed">
            <p>
              Desde <strong>setembro/2024</strong>, a Microsoft <strong>desativou</strong> a autenticação SMTP básica
              para contas pessoais <code>@outlook.com</code> / <code>@hotmail.com</code> / <code>@live.com</code> —
              mesmo com Senha de App e verificação em 2 etapas ativadas.
            </p>
            <p className="text-xs text-muted-foreground">
              Erro retornado pelo servidor: <code>535 5.7.139 SmtpClientAuthentication is disabled</code>.
            </p>
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs space-y-1">
              <p className="font-semibold">✅ Solução recomendada:</p>
              <p>Conecte sua conta Outlook via <strong>OAuth</strong> (método oficial da Microsoft para contas pessoais).</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Alternativas: use uma conta <strong>Gmail</strong> com Senha de App, ou peça ao admin do Microsoft 365
              corporativo para liberar "Authenticated SMTP".
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOutlookWarnOpen(false)} disabled={connectingOAuth}>
              Fechar
            </Button>
            <Button onClick={connectOutlookOAuth} disabled={connectingOAuth}>
              {connectingOAuth ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              Conectar com Outlook (OAuth)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sendTestAcc} onOpenChange={(o) => !o && !sendingTest && setSendTestAcc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar e-mail de teste</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground rounded-md bg-muted/40 p-2 border border-border/60">
              Conta: <strong>{sendTestAcc?.email}</strong> via <code>{sendTestAcc?.smtp_host}:{sendTestAcc?.smtp_port}</code>
            </div>
            <div className="space-y-1">
              <Label>Enviar para *</Label>
              <Input type="email" value={sendTestTo} onChange={(e) => setSendTestTo(e.target.value)} placeholder="destinatario@exemplo.com" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setSendTestAcc(null)} disabled={sendingTest}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!sendTestAcc || !sendTestTo) {
                  toast({ title: "Informe o destinatário", variant: "destructive" });
                  return;
                }
                setSendingTest(true);
                try {
                  const { data, error } = await supabase.functions.invoke("email-smtp-test", {
                    body: {
                      host: sendTestAcc.smtp_host,
                      port: sendTestAcc.smtp_port,
                      secure: sendTestAcc.smtp_secure,
                      user: sendTestAcc.smtp_user || sendTestAcc.email,
                      pass: sendTestAcc.smtp_pass,
                      from: sendTestAcc.email,
                      to: sendTestTo,
                      sendTest: true,
                      subject: "✅ Teste de envio - Lead SaaS",
                      body: `Olá!\n\nEste é um e-mail de teste enviado pela conta ${sendTestAcc.email}.\nSe você está lendo, sua configuração SMTP está funcionando perfeitamente.\n\n— Lead SaaS`,
                    },
                  });
                  if (error || !data?.ok) {
                    toast({ title: "Falha no envio", description: (data as any)?.error || error?.message || "Erro desconhecido", variant: "destructive" });
                  } else {
                    toast({ title: "✓ E-mail enviado", description: `Verifique a caixa de entrada de ${sendTestTo}` });
                    setSendTestAcc(null);
                  }
                } finally {
                  setSendingTest(false);
                }
              }}
              disabled={sendingTest}
            >
              {sendingTest ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />}
              Enviar teste
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