import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Stage = { id: string; name: string; color: string; sort_order: number };
type Conv = { id: string; phone: string; contact_name: string | null; last_message_at: string; last_message_preview: string | null; stage_id: string | null; unread_count: number; tags: string[] };

function Card({ c }: { c: Conv }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  const style = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, opacity: isDragging ? 0.4 : 1 } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className="bg-card border border-border/60 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm truncate">{c.contact_name || c.phone}</span>
        {c.unread_count > 0 && <Badge className="bg-green-600 text-white text-[10px] h-5 min-w-5 rounded-full flex items-center justify-center">{c.unread_count}</Badge>}
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.last_message_preview || "—"}</p>
      <div className="flex items-center justify-between gap-2 mt-2 text-[10px] text-muted-foreground">
        <span>{formatDistanceToNow(new Date(c.last_message_at), { locale: ptBR, addSuffix: true })}</span>
        {c.tags?.length > 0 && <div className="flex gap-1">{c.tags.slice(0, 2).map((t) => <Badge key={t} variant="secondary" className="text-[9px] px-1">{t}</Badge>)}</div>}
      </div>
    </div>
  );
}

function Column({ stage, items }: { stage: Stage; items: Conv[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} className={`flex-1 min-w-[260px] max-w-[320px] bg-muted/40 rounded-xl flex flex-col ${isOver ? "ring-2 ring-primary" : ""}`}>
      <div className="p-3 border-b border-border/40 flex items-center justify-between sticky top-0 bg-muted/60 rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: stage.color }} />
          <span className="font-semibold text-sm">{stage.name}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[70vh]">
        {items.map((c) => <Card key={c.id} c={c} />)}
        {items.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-6">Vazio</p>}
      </div>
    </div>
  );
}

export function KanbanBoard() {
  const { user } = useAuth();
  const [stages, setStages] = useState<Stage[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    if (!user) return;
    const { data: pipe } = await supabase.from("crm_pipelines").select("id").eq("user_id", user.id).eq("is_default", true).maybeSingle();
    if (!pipe) return;
    const { data: st } = await supabase.from("crm_stages").select("*").eq("pipeline_id", pipe.id).order("sort_order");
    setStages((st || []) as any);
    const { data: cv } = await supabase.from("crm_conversations").select("*").eq("user_id", user.id).order("last_message_at", { ascending: false }).limit(500);
    setConvs((cv || []) as any);
  };

  useEffect(() => { load(); }, [user]);

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const convId = String(e.active.id);
    const stageId = e.over?.id ? String(e.over.id) : null;
    if (!stageId) return;
    setConvs((cs) => cs.map((c) => c.id === convId ? { ...c, stage_id: stageId } : c));
    await supabase.from("crm_conversations").update({ stage_id: stageId }).eq("id", convId);
  };

  const dragged = convs.find((c) => c.id === activeId);

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((s) => (
          <Column key={s.id} stage={s} items={convs.filter((c) => c.stage_id === s.id)} />
        ))}
      </div>
      <DragOverlay>{dragged ? <Card c={dragged} /> : null}</DragOverlay>
    </DndContext>
  );
}