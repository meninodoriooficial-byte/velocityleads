import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, Copy, ExternalLink, Mail, Info } from "lucide-react";

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
          <AccordionContent className="space-y-2 text-sm">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Acesse o <a className="text-primary underline inline-flex items-center gap-1" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console <ExternalLink className="size-3" /></a> e crie/selecione um projeto.</li>
              <li>Em <strong>APIs &amp; Services → Library</strong>, ative a <a className="text-primary underline" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer">Gmail API</a>.</li>
              <li>Em <strong>OAuth consent screen</strong>: tipo <em>External</em>, preencha nome do app, e-mail de suporte e logo. Em <em>Scopes</em>, adicione: <code className="bg-muted px-1 rounded">.../auth/gmail.send</code> e <code className="bg-muted px-1 rounded">.../auth/userinfo.email</code>.</li>
              <li>Adicione usuários de teste enquanto o app estiver em modo <em>Testing</em> (ou publique para produção).</li>
              <li>Em <strong>Credentials → Create Credentials → OAuth client ID</strong>, escolha <em>Web application</em>.</li>
              <li>Em <em>Authorized redirect URIs</em>, cole a URL do Google acima.</li>
              <li>Copie o <strong>Client ID</strong> e <strong>Client Secret</strong> e cole nos campos abaixo.</li>
            </ol>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="microsoft">
          <AccordionTrigger className="text-sm font-semibold">📗 Tutorial — Microsoft / Outlook / Hotmail</AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Acesse o <a className="text-primary underline inline-flex items-center gap-1" href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer">Azure Portal — App registrations <ExternalLink className="size-3" /></a>.</li>
              <li>Clique em <strong>New registration</strong>. Em <em>Supported account types</em>, escolha <strong>"Accounts in any organizational directory and personal Microsoft accounts"</strong> (necessário para Hotmail/Outlook.com).</li>
              <li>Em <em>Redirect URI</em>, selecione <strong>Web</strong> e cole a URL da Microsoft acima.</li>
              <li>Após criar, em <strong>Certificates &amp; secrets → New client secret</strong>, gere um segredo e copie o <em>Value</em> (só aparece uma vez).</li>
              <li>Em <strong>API permissions → Add a permission → Microsoft Graph → Delegated</strong>, adicione: <code className="bg-muted px-1 rounded">Mail.Send</code>, <code className="bg-muted px-1 rounded">offline_access</code>, <code className="bg-muted px-1 rounded">User.Read</code>, <code className="bg-muted px-1 rounded">SMTP.Send</code>.</li>
              <li>Copie o <strong>Application (client) ID</strong> e o <strong>Client Secret</strong> e cole nos campos abaixo. Mantenha o tenant como <code className="bg-muted px-1 rounded">common</code> para aceitar contas pessoais e corporativas.</li>
            </ol>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Google form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Mail className="size-4 text-primary" /> Google / Gmail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Client ID</Label>
            <Input value={cfg.google_client_id} onChange={(e) => setCfg({ ...cfg, google_client_id: e.target.value })} placeholder="123456789-xxx.apps.googleusercontent.com" />
          </div>
          <div className="space-y-1">
            <Label>Client Secret</Label>
            <Input type="password" value={cfg.google_client_secret} onChange={(e) => setCfg({ ...cfg, google_client_secret: e.target.value })} placeholder="GOCSPX-..." />
          </div>
        </CardContent>
      </Card>

      {/* Microsoft form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Mail className="size-4 text-primary" /> Microsoft / Outlook / Hotmail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Application (Client) ID</Label>
            <Input value={cfg.microsoft_client_id} onChange={(e) => setCfg({ ...cfg, microsoft_client_id: e.target.value })} placeholder="00000000-0000-0000-0000-000000000000" />
          </div>
          <div className="space-y-1">
            <Label>Client Secret (Value)</Label>
            <Input type="password" value={cfg.microsoft_client_secret} onChange={(e) => setCfg({ ...cfg, microsoft_client_secret: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Tenant</Label>
            <Input value={cfg.microsoft_tenant} onChange={(e) => setCfg({ ...cfg, microsoft_tenant: e.target.value })} placeholder="common" />
            <p className="text-[10px] text-muted-foreground">Use <code>common</code> para aceitar contas pessoais (Hotmail/Outlook) + corporativas. Para restringir a uma organização, coloque o GUID do tenant.</p>
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