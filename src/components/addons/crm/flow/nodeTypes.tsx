import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap, MessageSquare, Clock, ArrowRightCircle, Tag, StopCircle, KeyRound } from "lucide-react";

const base =
  "rounded-xl border-2 bg-card shadow-md min-w-[220px] text-xs select-none transition-all hover:shadow-lg";

function NodeShell({
  color, icon: Icon, title, children, hasIn = true, hasOut = true, selected,
}: any) {
  return (
    <div
      className={`${base} ${selected ? "ring-2 ring-primary" : ""}`}
      style={{ borderColor: color }}
    >
      {hasIn && <Handle type="target" position={Position.Top} style={{ background: color, width: 10, height: 10 }} />}
      <div className="flex items-center gap-2 px-3 py-2 rounded-t-[0.6rem] text-white font-bold" style={{ background: color }}>
        <Icon className="size-3.5" /> {title}
      </div>
      <div className="p-3 space-y-1">{children}</div>
      {hasOut && <Handle type="source" position={Position.Bottom} style={{ background: color, width: 10, height: 10 }} />}
    </div>
  );
}

export function TriggerNode({ data, selected }: NodeProps) {
  const d: any = data;
  return (
    <NodeShell color="#8b5cf6" icon={Zap} title="Gatilho" hasIn={false} selected={selected}>
      <div className="font-semibold">{d.trigger_type === "keyword" ? "Palavra-chave" : "1ª resposta do lead"}</div>
      {d.trigger_type === "keyword" && <div className="text-muted-foreground">"{d.keyword || "—"}"</div>}
    </NodeShell>
  );
}

export function SendMessageNode({ data, selected }: NodeProps) {
  const d: any = data;
  return (
    <NodeShell color="#10b981" icon={MessageSquare} title="Enviar mensagem" selected={selected}>
      <div className="line-clamp-3 text-muted-foreground whitespace-pre-wrap">{d.text || "Clique para editar..."}</div>
    </NodeShell>
  );
}

export function WaitNode({ data, selected }: NodeProps) {
  const d: any = data;
  return (
    <NodeShell color="#f59e0b" icon={Clock} title="Aguardar" selected={selected}>
      <div className="font-semibold">{d.minutes || 0} minuto(s)</div>
    </NodeShell>
  );
}

export function MoveStageNode({ data, selected }: NodeProps) {
  const d: any = data;
  return (
    <NodeShell color="#3b82f6" icon={ArrowRightCircle} title="Mover etapa" selected={selected}>
      <div className="font-semibold">{d.stage_name || "—"}</div>
    </NodeShell>
  );
}

export function AddTagNode({ data, selected }: NodeProps) {
  const d: any = data;
  return (
    <NodeShell color="#ec4899" icon={Tag} title="Adicionar tag" selected={selected}>
      <div className="font-semibold">{d.tag || "—"}</div>
    </NodeShell>
  );
}

export function EndNode({ selected }: NodeProps) {
  return (
    <NodeShell color="#ef4444" icon={StopCircle} title="Finalizar" hasOut={false} selected={selected}>
      <div className="text-muted-foreground">Encerra o fluxo</div>
    </NodeShell>
  );
}

export const nodeTypes = {
  trigger: TriggerNode,
  send_message: SendMessageNode,
  wait: WaitNode,
  move_stage: MoveStageNode,
  add_tag: AddTagNode,
  end: EndNode,
};

export const PALETTE: { type: keyof typeof nodeTypes; label: string; color: string; icon: any; defaults: any }[] = [
  { type: "send_message", label: "Enviar mensagem", color: "#10b981", icon: MessageSquare, defaults: { text: "Olá {{nome}} 👋" } },
  { type: "wait", label: "Aguardar", color: "#f59e0b", icon: Clock, defaults: { minutes: 5 } },
  { type: "move_stage", label: "Mover etapa", color: "#3b82f6", icon: ArrowRightCircle, defaults: { stage_name: "Em qualificação" } },
  { type: "add_tag", label: "Adicionar tag", color: "#ec4899", icon: Tag, defaults: { tag: "novo" } },
  { type: "end", label: "Finalizar", color: "#ef4444", icon: StopCircle, defaults: {} },
];

export const TRIGGER_ICON = KeyRound;