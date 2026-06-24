import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Save, Zap } from "lucide-react";

type Flow = { id: string; name: string; is_active: boolean; trigger: any; steps: any[] };

const STEP_TEMPLATE = `[
  { "type": "send_message", "text": "Olá {{nome}}, recebi sua mensagem 👋" },
  { "type": "wait", "minutes": 5 },
  { "type": "send_message", "text": "Posso te ligar agora ou prefere mais tarde?" }
]`;

export function FlowsManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Flow[]>([]);
  const [sel, setSel] = useState<Flow | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [trigType, setTrigType] = useState("first_inbound");
  const [trigKeyword, setTrigKeyword] = useState("");
  const [stepsJson, setStepsJson] = useState(STEP_TEMPLATE);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("crm_flows").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setItems((data || []) as any);
  };
  useEffect(() => { load(); }, [user]);

  const startNew = () => {
    setSel(null); setName(""); setActive(true); setTrigType("first_inbound"); setTrigKeyword(""); setStepsJson(STEP_TEMPLATE);
  };
  const startEdit = (f: Flow) => {
    setSel(f); setName(f.name); setActive(f.is_active);
    setTrigType(f.trigger?.type || "first_inbound");
    setTrigKeyword(f.trigger?.keyword || "");
    setStepsJson(JSON.stringify(f.steps || [], null, 2));
  };

  const save = async () => {
    if (!user || !name.trim()) { toast({ title: "Dê um nome ao fluxo", variant: "destructive" }); return; }
    let steps: any[] = [];
    try { steps = JSON.parse(stepsJson); } catch { toast({ title: "JSON dos passos inválido", variant: "destructive" }); return; }
    const trigger: any = { type: trigType };
    if (trigType === "keyword") trigger.keyword = trigKeyword.trim();
    const payload = { user_id: user.id, name: name.trim(), is_active: active, trigger, steps };
    const res = sel ? await supabase.from("crm_flows").update(payload).eq("id", sel.id) : await supabase.from("crm_flows").insert(payload);
    if (res.error) { toast({ title: "Erro", description: res.error.message, variant: "destructive" }); return; }
    toast({ title: "✓ Fluxo salvo" });
    await load(); startNew();
  };

  const remove = async (f: Flow) => {
    if (!confirm(`Remover fluxo "${f.name}"?`)) return;
    await supabase.from("crm_flows").delete().eq("id", f.id);
    if (sel?.id === f.id) startNew();
    await load();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
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
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Boas-vindas" /></div>
          <div className="space-y-1"><Label>Ativo</Label><Switch checked={active} onCheckedChange={setActive} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Gatilho</Label>
            <Select value={trigType} onValueChange={setTrigType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="first_inbound">Primeira resposta do lead</SelectItem>
                <SelectItem value="keyword">Palavra-chave</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {trigType === "keyword" && (
            <div className="space-y-1"><Label>Palavra-chave</Label><Input value={trigKeyword} onChange={(e) => setTrigKeyword(e.target.value)} placeholder="preço" /></div>
          )}
        </div>
        <div className="space-y-1">
          <Label>Passos (JSON)</Label>
          <Textarea rows={10} className="font-mono text-xs" value={stepsJson} onChange={(e) => setStepsJson(e.target.value)} />
          <p className="text-xs text-muted-foreground">Tipos: <code>send_message</code>, <code>wait</code> (minutes), <code>move_stage</code>, <code>add_tag</code>, <code>end</code>. Suporta tags como {"{{nome}}"}.</p>
        </div>
        <Button onClick={save}><Save className="size-4 mr-2" /> {sel ? "Salvar" : "Criar fluxo"}</Button>
      </div>
    </div>
  );
}