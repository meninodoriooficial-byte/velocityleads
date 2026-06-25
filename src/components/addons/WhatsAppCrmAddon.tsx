import { useState } from "react";
import { useUserAddons } from "@/hooks/useUserAddons";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Kanban, MessageSquare, Zap, GitBranch, Inbox, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConversationList, type Conversation } from "./crm/ConversationList";
import { ConversationView } from "./crm/ConversationView";
import { KanbanBoard } from "./crm/KanbanBoard";
import { QuickRepliesManager } from "./crm/QuickRepliesManager";
import { FlowsManager } from "./crm/FlowsManager";
import { CrmMetrics } from "./crm/CrmMetrics";

export function WhatsAppCrmAddon() {
  const { active } = useUserAddons();
  const addon = active.find((a) => a.addon_slug === "whatsapp_crm");
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [checking, setChecking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const handleCheckMessages = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-poll-messages");
      if (error) throw error;
      const processed = (data as any)?.totalProcessed ?? 0;
      toast.success(
        processed > 0
          ? `${processed} nova(s) mensagem(ns) recebida(s)`
          : "Nenhuma mensagem nova",
      );
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error("Falha ao verificar mensagens", { description: e?.message });
    } finally {
      setChecking(false);
    }
  };

  if (!addon) {
    return <div className="text-center py-12 text-sm text-muted-foreground">Você ainda não tem o add-on WhatsApp CRM Pro ativo.</div>;
  }

  const used = addon.monthly_used || 0;
  const quota = addon.monthly_quota || 0;
  const pct = quota > 0 ? (used / quota) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="card-elevated p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-green-600/15 text-green-700 dark:text-green-400 flex items-center justify-center">
            <Kanban className="size-5" />
          </div>
          <div>
            <div className="font-bold flex items-center gap-2">WhatsApp CRM Pro <Badge className="bg-green-600 hover:bg-green-600 text-white">ATIVO</Badge></div>
            <div className="text-xs text-muted-foreground">{addon.expires_at ? `Renova em ${new Date(addon.expires_at).toLocaleDateString("pt-BR")}` : "Acesso ativo"}</div>
          </div>
        </div>
        <div className="min-w-[220px] flex-1 max-w-sm">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-muted-foreground">Mensagens no mês</span>
            <span className="tabular-nums font-bold">{used} / {quota || "—"}</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      </div>

      <Tabs defaultValue="inbox">
        <div className="flex items-center gap-2">
          <TabsList className="grid flex-1 grid-cols-4">
            <TabsTrigger value="inbox" className="gap-2"><Inbox className="size-4" /> Inbox</TabsTrigger>
            <TabsTrigger value="kanban" className="gap-2"><Kanban className="size-4" /> Kanban</TabsTrigger>
            <TabsTrigger value="quick" className="gap-2"><MessageSquare className="size-4" /> Respostas rápidas</TabsTrigger>
            <TabsTrigger value="flows" className="gap-2"><GitBranch className="size-4" /> Fluxos</TabsTrigger>
          </TabsList>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCheckMessages}
            disabled={checking}
            className="gap-2 shrink-0"
          >
            {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Verificar mensagens recebidas
          </Button>
        </div>

        <TabsContent value="inbox" className="mt-4">
          <CrmMetrics />
          <div className="mt-4 grid grid-cols-[320px_1fr] h-[calc(100vh-360px)] min-h-[500px] border border-border/60 rounded-xl overflow-hidden bg-card">
            <div className="border-r border-border/60">
              <ConversationList key={reloadKey} selectedId={selected?.id} onSelect={setSelected} />
            </div>
            {selected ? (
              <ConversationView conversation={selected} />
            ) : (
              <div className="flex items-center justify-center text-sm text-muted-foreground">
                <div className="text-center">
                  <Zap className="size-8 mx-auto mb-2 opacity-40" />
                  Selecione uma conversa à esquerda
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="kanban" className="mt-4">
          <KanbanBoard />
        </TabsContent>

        <TabsContent value="quick" className="mt-4">
          <QuickRepliesManager />
        </TabsContent>

        <TabsContent value="flows" className="mt-4">
          <FlowsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}