import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, TrendingUp, Clock, CheckCircle2 } from "lucide-react";

type Stats = { open: number; today: number; avgResp: string; won: number };

export function CrmMetrics() {
  const { user } = useAuth();
  const [s, setS] = useState<Stats>({ open: 0, today: 0, avgResp: "—", won: 0 });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const [openRes, todayRes, wonStageRes] = await Promise.all([
        supabase.from("crm_conversations").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "open"),
        supabase.from("crm_messages").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since.toISOString()),
        supabase.from("crm_stages").select("id").eq("user_id", user.id).eq("is_won", true),
      ]);
      const wonStageIds = (wonStageRes.data || []).map((r: any) => r.id);
      let won = 0;
      if (wonStageIds.length) {
        const { count } = await supabase.from("crm_conversations").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).in("stage_id", wonStageIds);
        won = count || 0;
      }
      // Tempo médio: amostra das últimas 30 conversas
      const { data: recent } = await supabase.from("crm_conversations").select("id").eq("user_id", user.id)
        .order("last_message_at", { ascending: false }).limit(30);
      let totalMs = 0, n = 0;
      for (const c of recent || []) {
        const { data: ms } = await supabase.from("crm_messages").select("direction,created_at")
          .eq("conversation_id", c.id).order("created_at").limit(20);
        for (let i = 1; i < (ms?.length || 0); i++) {
          if (ms![i - 1].direction === "in" && ms![i].direction === "out") {
            totalMs += new Date(ms![i].created_at).getTime() - new Date(ms![i - 1].created_at).getTime();
            n++; break;
          }
        }
      }
      const avgResp = n ? `${Math.round(totalMs / n / 60000)} min` : "—";
      setS({ open: openRes.count || 0, today: todayRes.count || 0, avgResp, won });
    })();
  }, [user]);

  const Card = ({ icon: Icon, label, value, color }: any) => (
    <div className="card-elevated p-3 flex items-center gap-3">
      <div className={`size-9 rounded-lg flex items-center justify-center ${color}`}><Icon className="size-4" /></div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">{label}</div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card icon={MessageCircle} label="Conversas abertas" value={s.open} color="bg-blue-500/15 text-blue-600 dark:text-blue-400" />
      <Card icon={TrendingUp} label="Msgs hoje" value={s.today} color="bg-purple-500/15 text-purple-600 dark:text-purple-400" />
      <Card icon={Clock} label="T. médio resposta" value={s.avgResp} color="bg-amber-500/15 text-amber-600 dark:text-amber-400" />
      <Card icon={CheckCircle2} label="Ganhos" value={s.won} color="bg-green-500/15 text-green-600 dark:text-green-400" />
    </div>
  );
}