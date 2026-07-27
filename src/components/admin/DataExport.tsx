import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Database, Settings, FileCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const INCLUDED = [
  "Usuários e perfis (profiles, user_roles)",
  "Pacotes de busca e add-ons",
  "Configurações de APIs e IA (api_configs, system_settings)",
  "Pedidos e pagamentos (payment_orders)",
  "Instâncias e mensagens WhatsApp",
  "Contas e templates de Email + histórico",
  "Buscas e resultados",
  "CRM (pipelines, contatos, conversas, mensagens, fluxos)",
  "Logs de erro de API",
];

type Mode = "full" | "config" | "config-with-schema";

export const DataExport = () => {
  const [loading, setLoading] = useState<Mode | null>(null);

  const handleExport = async (mode: Mode) => {
    setLoading(mode);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão não encontrada");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-export-sql?mode=${mode}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Erro ${res.status}`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      const base = mode === "full" ? "velocityleads-export" : mode === "config" ? "velocityleads-config" : "velocityleads-config-schema";
      a.download = `${base}-${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success("Exportação concluída", { description: "O arquivo SQL foi baixado." });
    } catch (e: any) {
      toast.error("Falha ao exportar", { description: e?.message || String(e) });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
          <Database className="w-4 h-4" /> Conteúdo incluído no dump
        </div>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
          {INCLUDED.map((i) => <li key={i}>{i}</li>)}
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          Por segurança, chaves de API criptografadas, tokens OAuth e senhas SMTP são removidos do arquivo.
          O dump contém apenas comandos <code>INSERT</code> — a estrutura (tabelas) não é recriada.
        </p>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
          <Settings className="w-4 h-4" /> Exportação de configurações
        </div>
        <p className="text-sm text-muted-foreground">
          Exporta apenas as configurações do sistema: APIs, IA, pagamentos, WhatsApp, e-mail OAuth (system_settings),
          pacotes de busca e add-ons. Ideal para restaurar configurações após perda ou migrar para outro ambiente.
          Os <code>INSERT</code>s usam <code>ON CONFLICT</code> para atualizar registros existentes com segurança.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => handleExport("full")} disabled={!!loading} className="gap-2">
          {loading === "full" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {loading === "full" ? "Gerando dump..." : "Exportar dados (.sql)"}
        </Button>
        <Button onClick={() => handleExport("config")} disabled={!!loading} variant="secondary" className="gap-2">
          {loading === "config" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
          {loading === "config" ? "Gerando..." : "Exportar só configurações (.sql)"}
        </Button>
        <Button onClick={() => handleExport("config-with-schema")} disabled={!!loading} variant="outline" className="gap-2">
          {loading === "config-with-schema" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
          {loading === "config-with-schema" ? "Gerando..." : "Exportar configurações + estrutura (.sql)"}
        </Button>
      </div>
    </div>
  );
};