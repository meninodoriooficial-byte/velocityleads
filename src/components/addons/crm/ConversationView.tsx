import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Composer } from "./Composer";
import { MessageBubble, type CrmMessage } from "./MessageBubble";
import { Badge } from "@/components/ui/badge";
import type { Conversation } from "./ConversationList";
import { Phone } from "lucide-react";

interface Props { conversation: Conversation }

export function ConversationView({ conversation }: Props) {
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const fetchAll = async () => {
    const { data } = await supabase
      .from("crm_messages")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(500);
    setMessages((data || []) as any);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  };

  // marcar como lida
  const markRead = async () => {
    if (conversation.unread_count > 0) {
      await supabase.from("crm_conversations").update({ unread_count: 0 }).eq("id", conversation.id);
    }
  };

  useEffect(() => {
    fetchAll();
    markRead();
    const ch = supabase
      .channel(`crm_msgs_${conversation.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_messages", filter: `conversation_id=eq.${conversation.id}` }, (p) => {
        setMessages((m) => [...m, p.new as any]);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
        markRead();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border/60 p-3 flex items-center justify-between bg-background">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
            {(conversation.contact_name || conversation.phone).slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-sm">{conversation.contact_name || "Sem nome"}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="size-3" /> {conversation.phone}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversation.tags?.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
          <Badge variant={conversation.status === "open" ? "default" : "secondary"} className="text-[10px] capitalize">{conversation.status}</Badge>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 bg-muted/20">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-8">Nenhuma mensagem ainda.</p>
        )}
        {messages.map((m) => <MessageBubble key={m.id} m={m} />)}
      </div>
      <Composer conversationId={conversation.id} contactName={conversation.contact_name} phone={conversation.phone} onSent={fetchAll} />
    </div>
  );
}