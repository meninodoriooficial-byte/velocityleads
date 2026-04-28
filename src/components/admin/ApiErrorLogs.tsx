import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, RefreshCw, Trash2, CheckCircle2 } from "lucide-react";

interface ApiErrorLog {
  id: string;
  key_name: string;
  source: string;
  error_status: string | null;
  error_message: string | null;
  http_status: number | null;
  context: Record<string, any> | null;
  created_at: string;
}

const STATUS_HINTS: Record<string, string> = {
  REQUEST_DENIED: "Chave recusada — verifique se a Places API está habilitada e o billing ativo.",
  OVER_QUERY_LIMIT: "Cota excedida ou billing não habilitado no projeto Google Cloud.",
  INVALID_REQUEST: "Requisição inválida — parâmetros incorretos.",
  UNKNOWN_ERROR: "Erro temporário do Google. Tente novamente em instantes.",
  HTTP_ERROR: "O Google respondeu com erro HTTP.",
  NO_KEY: "Nenhuma chave configurada — o sistema usou dados simulados.",
  EXCEPTION: "Falha de rede ou erro inesperado durante a chamada.",
};

const isCritical = (status: string | null) =>
  !!status && ["REQUEST_DENIED", "OVER_QUERY_LIMIT", "HTTP_ERROR", "EXCEPTION"].includes(status);

export const ApiErrorLogs = ({ keyName = "GOOGLE_MAPS_API_KEY" }: { keyName?: string }) => {
  const [logs, setLogs] = useState<ApiErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const { toast } = useToast();

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("api_error_logs")
      .select("*")
      .eq("key_name", keyName)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      toast({ title: "Erro ao carregar logs", description: error.message, variant: "destructive" });
    } else {
      setLogs((data as ApiErrorLog[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [keyName]);

  const clearLogs = async () => {
    if (!confirm("Limpar todos os erros registrados desta integração?")) return;
    setClearing(true);
    const { error } = await supabase.from("api_error_logs").delete().eq("key_name", keyName);
    if (error) {
      toast({ title: "Erro ao limpar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Logs limpos com sucesso" });
      setLogs([]);
    }
    setClearing(false);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("pt-BR");
    } catch {
      return iso;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Erros recentes da integração
            </CardTitle>
            <CardDescription>
              Últimos 20 erros registrados pelo sistema ao chamar <code className="text-xs">{keyName}</code>.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            {logs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearLogs}
                disabled={clearing}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Limpar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
        ) : logs.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center flex flex-col items-center gap-2">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            Nenhum erro registrado. A integração está funcionando.
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`border rounded-md p-3 text-sm ${
                  isCritical(log.error_status) ? "border-destructive/30 bg-destructive/5" : "bg-muted/30"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge variant={isCritical(log.error_status) ? "destructive" : "secondary"}>
                    {log.error_status || "ERROR"}
                  </Badge>
                  {log.http_status && <Badge variant="outline">HTTP {log.http_status}</Badge>}
                  <Badge variant="outline" className="text-xs">{log.source}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDate(log.created_at)}
                  </span>
                </div>
                <p className="text-foreground">{log.error_message || "Sem mensagem"}</p>
                {log.error_status && STATUS_HINTS[log.error_status] && (
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    💡 {STATUS_HINTS[log.error_status]}
                  </p>
                )}
                {log.context && Object.keys(log.context).length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">
                      Ver contexto
                    </summary>
                    <pre className="text-xs mt-1 p-2 bg-background rounded border overflow-x-auto">
                      {JSON.stringify(log.context, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};