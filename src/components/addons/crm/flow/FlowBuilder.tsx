import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, addEdge, applyEdgeChanges, applyNodeChanges,
  type Edge, type Node, type Connection, type NodeChange, type EdgeChange, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes, PALETTE } from "./nodeTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, X, Paperclip, Loader2, FileText, Image as ImageIcon, FileAudio, File as FileIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";

export type FlowGraph = { nodes: Node[]; edges: Edge[] };

let nodeId = 0;
const uid = () => `n_${Date.now().toString(36)}_${(nodeId++).toString(36)}`;

const DEFAULT_GRAPH: FlowGraph = {
  nodes: [
    { id: "trigger", type: "trigger", position: { x: 250, y: 40 }, data: { trigger_type: "first_inbound", keyword: "" } },
  ],
  edges: [],
};

interface Props {
  value?: FlowGraph;
  onChange: (graph: FlowGraph, compiled: { trigger: any; steps: any[] }) => void;
}

export function FlowBuilder({ value, onChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const initial = value && value.nodes?.length ? value : DEFAULT_GRAPH;
  const [nodes, setNodes] = useState<Node[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) || null, [nodes, selectedId]);

  const compile = useCallback((ns: Node[], es: Edge[]) => {
    const trig = ns.find((n) => n.type === "trigger");
    const triggerData: any = trig?.data || { trigger_type: "first_inbound" };
    const trigger: any = { type: triggerData.trigger_type || "first_inbound" };
    if (trigger.type === "keyword") trigger.keyword = triggerData.keyword || "";

    const steps: any[] = [];
    const visited = new Set<string>();
    let cur = trig ? es.find((e) => e.source === trig.id)?.target : undefined;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const n = ns.find((x) => x.id === cur);
      if (!n) break;
      const d: any = n.data || {};
      if (n.type === "send_message") steps.push({ type: "send_message", text: d.text || "", attachments: Array.isArray(d.attachments) ? d.attachments : [] });
      else if (n.type === "wait") steps.push({ type: "wait", minutes: Number(d.minutes || 0) });
      else if (n.type === "move_stage") steps.push({ type: "move_stage", stage_name: d.stage_name || "" });
      else if (n.type === "add_tag") steps.push({ type: "add_tag", tag: d.tag || "" });
      else if (n.type === "end") { steps.push({ type: "end" }); break; }
      cur = es.find((e) => e.source === n.id)?.target;
    }
    return { trigger, steps };
  }, []);

  const emit = useCallback((ns: Node[], es: Edge[]) => {
    onChange({ nodes: ns, edges: es }, compile(ns, es));
  }, [compile, onChange]);

  const onNodesChange = useCallback((c: NodeChange[]) => {
    setNodes((nds) => { const next = applyNodeChanges(c, nds); emit(next, edges); return next; });
  }, [edges, emit]);
  const onEdgesChange = useCallback((c: EdgeChange[]) => {
    setEdges((eds) => { const next = applyEdgeChanges(c, eds); emit(nodes, next); return next; });
  }, [nodes, emit]);
  const onConnect = useCallback((c: Connection) => {
    setEdges((eds) => {
      // 1 saída por nó (executor é linear)
      const filtered = eds.filter((e) => e.source !== c.source);
      const next = addEdge({ ...c, animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }, filtered);
      emit(nodes, next);
      return next;
    });
  }, [nodes, emit]);

  const addNode = (type: keyof typeof nodeTypes, defaults: any) => {
    const id = uid();
    const last = nodes[nodes.length - 1];
    const pos = { x: (last?.position.x ?? 250), y: (last?.position.y ?? 40) + 140 };
    const newNode: Node = { id, type, position: pos, data: { ...defaults } };
    const next = [...nodes, newNode];
    setNodes(next); emit(next, edges); setSelectedId(id);
  };

  const updateData = (patch: any) => {
    if (!selected) return;
    const next = nodes.map((n) => n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n);
    setNodes(next); emit(next, edges);
  };

  const deleteSelected = () => {
    if (!selected || selected.id === "trigger") return;
    const ns = nodes.filter((n) => n.id !== selected.id);
    const es = edges.filter((e) => e.source !== selected.id && e.target !== selected.id);
    setNodes(ns); setEdges(es); setSelectedId(null); emit(ns, es);
  };

  useEffect(() => { emit(nodes, edges); /* initial */ }, []); // eslint-disable-line

  return (
    <div className="grid grid-cols-[180px_1fr_280px] gap-3 h-[600px]">
      {/* Paleta */}
      <div className="space-y-2 overflow-y-auto pr-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1">Blocos</div>
        {PALETTE.map((p) => (
          <button key={p.type} onClick={() => addNode(p.type, p.defaults)}
            className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-border/60 bg-card hover:border-primary hover:shadow-md transition-all text-left text-xs">
            <span className="size-7 rounded-md flex items-center justify-center text-white shrink-0" style={{ background: p.color }}>
              <p.icon className="size-3.5" />
            </span>
            <span className="font-semibold">{p.label}</span>
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="rounded-xl border border-border/60 overflow-hidden bg-muted/20">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={nodeTypes}
          fitView
          defaultEdgeOptions={{ animated: true, style: { strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed } }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-card" />
        </ReactFlow>
      </div>

      {/* Inspector */}
      <div className="rounded-xl border border-border/60 bg-card p-3 overflow-y-auto">
        {!selected ? (
          <div className="text-xs text-muted-foreground text-center py-8">
            Selecione um bloco para editar. Arraste das alças (●) para conectar blocos.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider">{selected.type}</div>
              <Button variant="ghost" size="icon-sm" onClick={() => setSelectedId(null)}><X className="size-3.5" /></Button>
            </div>

            {selected.type === "trigger" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de gatilho</Label>
                  <Select value={(selected.data as any).trigger_type} onValueChange={(v) => updateData({ trigger_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_inbound">Primeira resposta do lead</SelectItem>
                      <SelectItem value="keyword">Palavra-chave recebida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(selected.data as any).trigger_type === "keyword" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Palavra-chave</Label>
                    <Input value={(selected.data as any).keyword || ""} onChange={(e) => updateData({ keyword: e.target.value })} placeholder="preço" />
                  </div>
                )}
              </>
            )}

            {selected.type === "send_message" && (
              <div className="space-y-1">
                <Label className="text-xs">Mensagem</Label>
                <Textarea rows={6} value={(selected.data as any).text || ""} onChange={(e) => updateData({ text: e.target.value })} />
                <p className="text-[10px] text-muted-foreground">Use {"{{nome}}"} e {"{{telefone}}"} para personalizar.</p>
              </div>
            )}

            {selected.type === "wait" && (
              <div className="space-y-1">
                <Label className="text-xs">Minutos</Label>
                <Input type="number" min={1} value={(selected.data as any).minutes || 0} onChange={(e) => updateData({ minutes: Number(e.target.value) })} />
              </div>
            )}

            {selected.type === "move_stage" && (
              <div className="space-y-1">
                <Label className="text-xs">Nome da etapa</Label>
                <Input value={(selected.data as any).stage_name || ""} onChange={(e) => updateData({ stage_name: e.target.value })} placeholder="Em qualificação" />
              </div>
            )}

            {selected.type === "add_tag" && (
              <div className="space-y-1">
                <Label className="text-xs">Tag</Label>
                <Input value={(selected.data as any).tag || ""} onChange={(e) => updateData({ tag: e.target.value })} placeholder="quente" />
              </div>
            )}

            {selected.id !== "trigger" && (
              <Button variant="destructive" size="sm" className="w-full" onClick={deleteSelected}>
                <Trash2 className="size-3.5 mr-2" /> Excluir bloco
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}