import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, Copy, ExternalLink, Mail, Info, CheckCircle2, XCircle, PlugZap } from "lucide-react";

const SETTING_KEY = "email_oauth";
const PROJECT_REF = "gtoifsgptdchbmupbkvi";
const REDIRECT_BASE = `https://${PROJECT_REF}.supabase.co/functions/v1/email-oauth-callback`;
const GOOGLE_REDIRECT = `${REDIRECT_BASE}?provider=google`;
const MICROSOFT_REDIRECT = `${REDIRECT_BASE}?provider=microsoft`;

type OAuthConfig = {
  google_client_id: string;
  google_client_secret: string;
  microsoft_client_id: string;
  microsoft_client_secret: string;
  microsoft_tenant: string;
};

const empty: OAuthConfig = {
  google_client_id: "",
  google_client_secret: "",
  microsoft_client_id: "",
  microsoft_client_secret: "",
  microsoft_tenant: "common",
};

export const EmailOAuthConfig = () => {
  const [cfg, setCfg] = useState<OAuthConfig>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"google" | "microsoft" | null>(null);
  const [status, setStatus] = useState<{ google?: "ok" | "fail"; microsoft?: "ok" | "fail" }>({});
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", SETTING_KEY)
        .maybeSingle();
      if (data?.setting_value) setCfg({ ...empty, ...(data.setting_value as any) });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { setting_key: SETTING_KEY, setting_value: cfg as any, description: "Credenciais OAuth Gmail e Microsoft para Email Marketing" },
        { onConflict: "setting_key" }
      );
    setSaving(false);
    if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    else toast({ title: "✓ Credenciais salvas" });
  };

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast({ title: "Copiado!", description: txt });
  };

  const testGoogle = async () => {
    if (!cfg.google_client_id || !cfg.google_client_secret) {
      toast({ title: "Preencha Client ID e Secret", variant: "destructive" });
      return;
    }
    setTesting("google");
    try {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: "test_invalid_code",
        client_id: cfg.google_client_id,
        client_secret: cfg.google_client_secret,
        redirect_uri: GOOGLE_REDIRECT,
      });
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await res.json();
      // invalid_grant => credenciais OK; invalid_client => credenciais ruins
      if (data.error === "invalid_grant") {
        setStatus((s) => ({ ...s, google: "ok" }));
        toast({ title: "✓ Credenciais Google válidas" });
      } else if (data.error === "invalid_client") {
        setStatus((s) => ({ ...s, google: "fail" }));
        toast({ title: "Credenciais Google inválidas", description: data.error_description || data.error, variant: "destructive" });
      } else {
        setStatus((s) => ({ ...s, google: "ok" }));
        toast({ title: "✓ Conexão OK", description: data.error_description || "Resposta inesperada, mas o endpoint aceitou as credenciais." });
      }
    } catch (e: any) {
      setStatus((s) => ({ ...s, google: "fail" }));
      toast({ title: "Erro de rede", description: e.message, variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  const testMicrosoft = async () => {
    if (!cfg.microsoft_client_id || !cfg.microsoft_client_secret) {
      toast({ title: "Preencha Client ID e Secret", variant: "destructive" });
      return;
    }
    setTesting("microsoft");
    try {
      const tenant = cfg.microsoft_tenant || "common";
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: cfg.microsoft_client_id,
        client_secret: cfg.microsoft_client_secret,
        scope: "https://graph.microsoft.com/.default",
      });
      const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await res.json();
      // tenant=common não aceita client_credentials → AADSTS9002313/AADSTS50059 = credenciais ainda assim foram aceitas
      // invalid_client / AADSTS7000215 (secret errado) / AADSTS700016 (client_id errado) = ruim
      const errDesc: string = data.error_description || "";
      const credsOk =
        res.ok ||
        errDesc.includes("AADSTS50059") || // sem tenant
        errDesc.includes("AADSTS9002313") || // request inválido mas creds reconhecidas
        errDesc.includes("AADSTS500011") || // resource not found (mas creds ok)
        errDesc.includes("AADSTS65001"); // consent required (creds ok)
      const credsBad =
        errDesc.includes("AADSTS7000215") ||
        errDesc.includes("AADSTS7000222") ||
        errDesc.includes("AADSTS700016") ||
        data.error === "invalid_client" ||
        data.error === "unauthorized_client";

      if (credsBad) {
        setStatus((s) => ({ ...s, microsoft: "fail" }));
        toast({ title: "Credenciais Microsoft inválidas", description: errDesc || data.error, variant: "destructive" });
      } else if (credsOk) {
        setStatus((s) => ({ ...s, microsoft: "ok" }));
        toast({ title: "✓ Credenciais Microsoft válidas" });
      } else {
        setStatus((s) => ({ ...s, microsoft: "ok" }));
        toast({ title: "✓ Conexão OK", description: errDesc || "Endpoint respondeu." });
      }
    } catch (e: any) {
      setStatus((s) => ({ ...s, microsoft: "fail" }));
      toast({ title: "Erro de rede", description: e.message, variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  const ActiveBadge = () => (
    <Badge className="bg-green-600 hover:bg-green-600 text-white border-transparent">
      <CheckCircle2 className="size-3 mr-1" /> Ativo
    </Badge>
  );
  const FailBadge = () => (
    <Badge variant="destructive">
      <XCircle className="size-3 mr-1" /> Inválido
    </Badge>
  );

  if (loading) return <div className="p-6"><Loader2 className="size-5 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="size-4" />
        <AlertTitle>Como funciona</AlertTitle>
        <AlertDescription>
          Essas credenciais permitem que os <strong>clientes do SaaS</strong> conectem suas próprias contas Gmail e Outlook/Hotmail via OAuth no add-on Email Marketing. Você configura uma única vez aqui; cada cliente faz o login na própria conta.
        </AlertDescription>
      </Alert>

      {/* URLs de redirect */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">URLs de redirecionamento (Redirect URIs)</CardTitle>
          <CardDescription>Cole exatamente estes valores no console do provedor ao criar a credencial OAuth.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Google</Label>
            <div className="flex gap-2">
              <Input readOnly value={GOOGLE_REDIRECT} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(GOOGLE_REDIRECT)}><Copy className="size-4" /></Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Microsoft</Label>
            <div className="flex gap-2">
              <Input readOnly value={MICROSOFT_REDIRECT} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(MICROSOFT_REDIRECT)}><Copy className="size-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tutoriais */}
      <Accordion type="multiple" className="w-full">
        <AccordionItem value="google">
          <AccordionTrigger className="text-sm font-semibold">📘 Tutorial — Google / Gmail</AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Siga exatamente nesta ordem. Cada passo abre uma tela diferente do Google Cloud — não pule.</p>
            <ol className="list-decimal pl-5 space-y-3">
              <li>
                <strong>Criar projeto</strong><br />
                Abra o <a className="text-primary underline inline-flex items-center gap-1" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud Console <ExternalLink className="size-3" /></a>, clique no seletor de projetos no topo e em <em>"Novo projeto"</em>. Dê um nome (ex.: <code className="bg-muted px-1 rounded">leads-saas</code>) e clique em <em>Criar</em>. Aguarde alguns segundos e selecione o projeto recém-criado.
              </li>
              <li>
                <strong>Ativar a Gmail API</strong><br />
                Acesse <a className="text-primary underline" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer">este link</a> (com seu projeto selecionado) e clique no botão azul <em>"Ativar"</em>. Aguarde até a tela mudar para "API ativada".
              </li>
              <li>
                <strong>Configurar a tela de consentimento (OAuth consent screen)</strong><br />
                Vá em <a className="text-primary underline" href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noreferrer">APIs &amp; Services → OAuth consent screen</a>.
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Tipo de usuário: <strong>External</strong> → <em>Criar</em>.</li>
                  <li><em>App name</em>: nome do seu SaaS. <em>User support email</em>: seu e-mail. <em>Developer contact</em>: seu e-mail. Salvar e continuar.</li>
                  <li>Tela <em>Scopes</em>: clique <em>"Add or remove scopes"</em>, marque <code className="bg-muted px-1 rounded">.../auth/userinfo.email</code> e cole no filtro <code className="bg-muted px-1 rounded">https://www.googleapis.com/auth/gmail.send</code> para localizar e marcar. Atualizar → Salvar e continuar.</li>
                  <li>Tela <em>Test users</em>: adicione os e-mails que farão testes (incluindo o seu) enquanto o app estiver em modo <em>Testing</em>. Para liberar para qualquer conta Google, depois clique em <em>"Publish app"</em>.</li>
                </ul>
              </li>
              <li>
                <strong>Criar a credencial OAuth</strong><br />
                Vá em <a className="text-primary underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Credentials</a> → <em>"+ Create credentials"</em> → <em>"OAuth client ID"</em>.
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><em>Application type</em>: <strong>Web application</strong>.</li>
                  <li><em>Name</em>: qualquer nome (ex.: <code className="bg-muted px-1 rounded">SaaS Web</code>).</li>
                  <li>Em <em>Authorized redirect URIs</em>, clique <em>"+ Add URI"</em> e cole exatamente a <strong>URL do Google</strong> mostrada no topo desta página (botão de copiar).</li>
                  <li>Clique <em>Create</em>.</li>
                </ul>
              </li>
              <li>
                <strong>Copiar as credenciais</strong><br />
                Aparecerá um popup com <strong>Client ID</strong> e <strong>Client secret</strong>. Copie ambos e cole nos campos do formulário <em>Google / Gmail</em> abaixo. Clique em <em>Salvar credenciais</em> no final desta página.
              </li>
            </ol>
            <Alert>
              <Info className="size-4" />
              <AlertDescription className="text-xs">
                Se mudar a Redirect URI depois, repita o passo 4 (Google não permite editar — é preciso adicionar a nova URL ou criar nova credencial).
              </AlertDescription>
            </Alert>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="microsoft">
          <AccordionTrigger className="text-sm font-semibold">📗 Tutorial — Microsoft / Outlook / Hotmail</AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Você precisa de uma conta Microsoft (pode ser Hotmail/Outlook pessoal mesmo). Siga na ordem.</p>
            <ol className="list-decimal pl-5 space-y-3">
              <li>
                <strong>Abrir App registrations</strong><br />
                Acesse <a className="text-primary underline inline-flex items-center gap-1" href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer">Azure Portal — App registrations <ExternalLink className="size-3" /></a> e faça login. Se for primeira vez, aceite os termos do Azure (gratuito, não precisa cartão).
              </li>
              <li>
                <strong>Registrar o app</strong><br />
                Clique em <em>"+ New registration"</em> no topo.
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><em>Name</em>: nome do app (ex.: <code className="bg-muted px-1 rounded">SaaS Leads Email</code>).</li>
                  <li><em>Supported account types</em>: escolha a 3ª opção — <strong>"Accounts in any organizational directory (Any Microsoft Entra ID tenant — Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"</strong>. ⚠ Sem isso, contas Hotmail/Outlook.com não funcionam.</li>
                  <li><em>Redirect URI</em>: selecione <strong>Web</strong> no dropdown e cole exatamente a <strong>URL da Microsoft</strong> mostrada no topo desta página.</li>
                  <li>Clique <em>Register</em>.</li>
                </ul>
              </li>
              <li>
                <strong>Copiar o Client ID</strong><br />
                Na tela <em>Overview</em> do app, copie o valor <strong>Application (client) ID</strong> e cole no campo correspondente abaixo. (O <em>Directory (tenant) ID</em> NÃO é necessário — deixe o tenant como <code className="bg-muted px-1 rounded">common</code>.)
              </li>
              <li>
                <strong>Gerar o Client Secret</strong><br />
                No menu esquerdo, vá em <em>Certificates &amp; secrets</em> → aba <em>Client secrets</em> → <em>"+ New client secret"</em>.
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Description: qualquer texto. Expires: <strong>24 months</strong> (máximo).</li>
                  <li>Clique <em>Add</em>. ⚠ Copie o <strong>Value</strong> imediatamente (a coluna "Value", não "Secret ID"). Ele só aparece uma vez — se sair da tela, terá que gerar outro.</li>
                  <li>Cole esse valor no campo <em>Client Secret (Value)</em> abaixo.</li>
                </ul>
              </li>
              <li>
                <strong>Adicionar permissões</strong><br />
                No menu esquerdo, <em>API permissions</em> → <em>"+ Add a permission"</em> → <strong>Microsoft Graph</strong> → <strong>Delegated permissions</strong>. Use o campo de busca para localizar e marcar cada uma:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><code className="bg-muted px-1 rounded">Mail.Send</code></li>
                  <li><code className="bg-muted px-1 rounded">offline_access</code></li>
                  <li><code className="bg-muted px-1 rounded">User.Read</code> (geralmente já vem por padrão)</li>
                  <li><code className="bg-muted px-1 rounded">SMTP.Send</code></li>
                </ul>
                Clique <em>Add permissions</em>. Não precisa de <em>"Grant admin consent"</em> para contas pessoais — cada usuário consente ao fazer login.
              </li>
              <li>
                <strong>Salvar</strong><br />
                Volte aqui, confirme que preencheu <em>Client ID</em>, <em>Client Secret</em> e <em>Tenant = common</em>, e clique em <em>Salvar credenciais</em>.
              </li>
            </ol>
            <Alert>
              <Info className="size-4" />
              <AlertDescription className="text-xs">
                Erro <code>AADSTS50194</code> ao logar = você esqueceu de marcar "personal Microsoft accounts" no passo 2. Recrie o registro.
              </AlertDescription>
            </Alert>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Google form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4 text-primary" /> Google / Gmail
            {status.google === "ok" && <ActiveBadge />}
            {status.google === "fail" && <FailBadge />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Client ID</Label>
            <Input value={cfg.google_client_id} onChange={(e) => setCfg({ ...cfg, google_client_id: e.target.value })} placeholder="123456789-xxx.apps.googleusercontent.com" />
          </div>
          <div className="space-y-1">
            <Label>Client Secret</Label>
            <PasswordInput value={cfg.google_client_secret} onChange={(e) => setCfg({ ...cfg, google_client_secret: e.target.value })} placeholder="GOCSPX-..." />
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={testGoogle} disabled={testing === "google"}>
              {testing === "google" ? <Loader2 className="size-4 mr-2 animate-spin" /> : <PlugZap className="size-4 mr-2" />}
              Testar credenciais
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Microsoft form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4 text-primary" /> Microsoft / Outlook / Hotmail
            {status.microsoft === "ok" && <ActiveBadge />}
            {status.microsoft === "fail" && <FailBadge />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Application (Client) ID</Label>
            <Input value={cfg.microsoft_client_id} onChange={(e) => setCfg({ ...cfg, microsoft_client_id: e.target.value })} placeholder="00000000-0000-0000-0000-000000000000" />
          </div>
          <div className="space-y-1">
            <Label>Client Secret (Value)</Label>
            <PasswordInput value={cfg.microsoft_client_secret} onChange={(e) => setCfg({ ...cfg, microsoft_client_secret: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Tenant</Label>
            <Input value={cfg.microsoft_tenant} onChange={(e) => setCfg({ ...cfg, microsoft_tenant: e.target.value })} placeholder="common" />
            <p className="text-[10px] text-muted-foreground">Use <code>common</code> para aceitar contas pessoais (Hotmail/Outlook) + corporativas. Para restringir a uma organização, coloque o GUID do tenant.</p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={testMicrosoft} disabled={testing === "microsoft"}>
              {testing === "microsoft" ? <Loader2 className="size-4 mr-2 animate-spin" /> : <PlugZap className="size-4 mr-2" />}
              Testar credenciais
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
          Salvar credenciais
        </Button>
      </div>
    </div>
  );
};

export default EmailOAuthConfig;