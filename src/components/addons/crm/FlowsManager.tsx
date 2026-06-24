import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Save, Zap } from "lucide-react";
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
              <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); remove(f); }}><Trash2 className="size-3.5" /></Button>
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
        <FlowBuilder key={builderKey} value={graph} onChange={(g, c) => { setGraph(g); setCompiled(c); }} />
        <p className="text-xs text-muted-foreground">
          {compiled.steps.length} passo(s) compilado(s) · Arraste das alças (●) para conectar blocos · Variáveis: {"{{nome}}"}, {"{{telefone}}"}
        </p>
      </div>
    </div>
  );
}