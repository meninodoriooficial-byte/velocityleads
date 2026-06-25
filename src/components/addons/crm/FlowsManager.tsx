import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Save, Zap, Maximize2, X, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FlowBuilder, type FlowGraph } from "./flow/FlowBuilder";

type Flow = { id: string; name: string; is_active: boolean; trigger: any; steps: any[] };

export function FlowsManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Flow[]>([]);
  const [sel, setSel] = useState<Flow | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [graph, setGraph] = useState<FlowGraph | undefined>(undefined);
  const [compiled, setCompiled] = useState<{ trigger: any; steps: any[] }>({ trigger: { type: "first_inbound" }, steps: [] });
  const [builderKey, setBuilderKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("crm_flows").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setItems((data || []) as any);
  };
  useEffect(() => { load(); }, [user]);

  const startNew = () => {
    setSel(null); setName(""); setActive(true);
    setGraph(undefined);
    setCompiled({ trigger: { type: "first_inbound" }, steps: [] });
    setBuilderKey((k) => k + 1);
  };
  const startEdit = (f: Flow) => {
    setSel(f); setName(f.name); setActive(f.is_active);
    setGraph(f.trigger?.graph);
    setCompiled({
      trigger: { type: f.trigger?.type || "first_inbound", ...(f.trigger?.keyword ? { keyword: f.trigger.keyword } : {}) },
      steps: f.steps || [],
    });
    setBuilderKey((k) => k + 1);
  };

  const save = async () => {
    if (!user || !name.trim()) { toast({ title: "Dê um nome ao fluxo", variant: "destructive" }); return; }
    const trigger: any = { ...compiled.trigger, graph };
    const payload = { user_id: user.id, name: name.trim(), is_active: active, trigger, steps: compiled.steps };
    const res = sel
      ? await supabase.from("crm_flows").update(payload).eq("id", sel.id)
      : await supabase.from("crm_flows").insert(payload);
    if (res.error) { toast({ title: "Erro", description: res.error.message, variant: "destructive" }); return; }
    toast({ title: "✓ Fluxo salvo", description: `${compiled.steps.length} passo(s) compilado(s)` });
    await load(); startNew();
  };

  const remove = async (f: Flow) => {
    if (!confirm(`Remover fluxo "${f.name}"?`)) return;
    await supabase.from("crm_flows").delete().eq("id", f.id);
    if (sel?.id === f.id) startNew();
    await load();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      <div className="space-y-2">
        <Button onClick={startNew} variant="outline" className="w-full"><Plus className="size-4 mr-2" /> Novo fluxo</Button>
        {items.length === 0 && <p className="text-xs text-muted-foreground p-3">Nenhum fluxo configurado.</p>}
        {items.map((f) => (
          <div key={f.id} onClick={() => startEdit(f)}
            className={`p-3 rounded-lg border cursor-pointer ${sel?.id === f.id ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/40"}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm flex items-center gap-2"><Zap className="size-3.5" /> {f.name}</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" title="Editar fluxo" onClick={(e) => { e.stopPropagation(); startEdit(f); setEditorOpen(true); }}><Pencil className="size-3.5" /></Button>
                <Button variant="ghost" size="icon-sm" title="Excluir fluxo" onClick={(e) => { e.stopPropagation(); remove(f); }}><Trash2 className="size-3.5" /></Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{f.trigger?.type} · {f.steps?.length || 0} passo(s) · {f.is_active ? "ativo" : "inativo"}</div>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Boas-vindas" /></div>
          <div className="space-y-1"><Label>Ativo</Label><div className="h-10 flex items-center"><Switch checked={active} onCheckedChange={setActive} /></div></div>
          <Button onClick={save}><Save className="size-4 mr-2" /> {sel ? "Salvar" : "Criar fluxo"}</Button>
        </div>
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-6 flex flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground text-center">
            {compiled.steps.length} passo(s) compilado(s) · Variáveis: {"{{nome}}"}, {"{{telefone}}"}
          </p>
          <Button onClick={() => setEditorOpen(true)} variant="default">
            <Maximize2 className="size-4 mr-2" /> Abrir editor visual de fluxos
          </Button>
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] p-0 flex flex-col gap-0 sm:rounded-lg overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border/60 flex-row items-center justify-between space-y-0">
            <DialogTitle className="flex items-center gap-2">
              <Zap className="size-4 text-primary" />
              Editor visual de fluxos {name ? `· ${name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FlowBuilder key={builderKey} value={graph} onChange={(g, c) => { setGraph(g); setCompiled(c); }} />
          </div>
          <DialogFooter className="px-4 py-3 border-t border-border/60 flex-row sm:justify-between items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {compiled.steps.length} passo(s) · Arraste das alças (●) para conectar blocos
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                <X className="size-4 mr-2" /> Fechar
              </Button>
              <Button onClick={async () => { await save(); setEditorOpen(false); }}>
                <Save className="size-4 mr-2" /> Salvar fluxo
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}