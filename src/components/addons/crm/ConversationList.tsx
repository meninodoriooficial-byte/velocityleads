import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search } from "lucide-react";

export type Conversation = {
  id: string;
  phone: string;
  contact_name: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  tags: string[];
  status: string;
  stage_id: string | null;
};

interface Props {
  selectedId?: string | null;
  onSelect: (c: Conversation) => void;
}

export function ConversationList({ selectedId, onSelect }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState("");

  const fetchAll = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("crm_conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(200);
    setItems((data || []) as any);
  };

  useEffect(() => {
    fetchAll();
    if (!user) return;
    const ch = supabase
      .channel("crm_conversations_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_conversations", filter: `user_id=eq.${user.id}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = items.filter((c) => {
    if (!filter) return true;
    const s = filter.toLowerCase();
    return (c.contact_name || "").toLowerCase().includes(s) || c.phone.includes(s) || (c.last_message_preview || "").toLowerCase().includes(s);
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border/60">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar conversa..." className="pl-8" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground p-4 text-center">Nenhuma conversa ainda. Quando um lead responder, ela aparece aqui.</p>
        )}
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className={`w-full text-left p-3 border-b border-border/40 hover:bg-muted/40 transition-colors ${selectedId === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm truncate">{c.contact_name || c.phone}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(c.last_message_at), { locale: ptBR, addSuffix: false })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <p className="text-xs text-muted-foreground truncate flex-1">{c.last_message_preview || "—"}</p>
              {c.unread_count > 0 && (
                <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px] min-w-5 h-5 rounded-full flex items-center justify-center">
                  {c.unread_count}
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}