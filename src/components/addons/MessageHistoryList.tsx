import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle } from "lucide-react";

type Item = {
  id: string;
  phone: string;
  rendered_message: string;
  status: string;
  error: string | null;
  created_at: string;
};

export const MessageHistoryList = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("message_history")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      setItems((data || []) as any);
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <p className="text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin inline mr-1" /> Carregando...</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nenhum envio realizado ainda.</p>;

  return (
    <div className="space-y-2">
      {items.map((m) => (
        <div key={m.id} className="p-3 rounded-lg border border-border/60 bg-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MessageCircle className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-mono">{m.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{new Date(m.created_at).toLocaleString("pt-BR")}</span>
              <Badge variant={m.status === "sent" ? "default" : "destructive"} className="text-[10px]">
                {m.status}
              </Badge>
            </div>
          </div>
          <p className="text-sm mt-2 whitespace-pre-wrap text-muted-foreground line-clamp-3">{m.rendered_message}</p>
          {m.error && <p className="text-xs text-destructive mt-1">{m.error}</p>}
        </div>
      ))}
    </div>
  );
};