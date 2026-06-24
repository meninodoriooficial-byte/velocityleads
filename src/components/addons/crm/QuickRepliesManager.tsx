import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Save } from "lucide-react";

type Q = { id: string; shortcut: string; title: string; body: string };

export function QuickRepliesManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Q[]>([]);
  const [sel, setSel] = useState<Q | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("crm_quick_replies").select("*").eq("user_id", user.id).order("sort_order");
    setItems((data || []) as any);
  };
  useEffect(() => { load(); }, [user]);

  const startNew = () => { setSel(null); setShortcut("/"); setTitle(""); setBody(""); };
  const startEdit = (q: Q) => { setSel(q); setShortcut(q.shortcut); setTitle(q.title); setBody(q.body); };

  const save = async () => {
    if (!user || !shortcut.trim() || !body.trim()) { toast({ title: "Preencha atalho e corpo", variant: "destructive" }); return; }
    const payload = { user_id: user.id, shortcut: shortcut.trim(), title: title.trim() || shortcut.trim(), body };
    const res = sel ? await supabase.from("crm_quick_replies").update(payload).eq("id", sel.id) : await supabase.from("crm_quick_replies").insert(payload);
    if (res.error) { toast({ title: "Erro", description: res.error.message, variant: "destructive" }); return; }
    toast({ title: "✓ Salvo" });
    await load(); startNew();
  };

  const remove = async (q: Q) => {
    if (!confirm(`Remover "${q.title}"?`)) return;
    await supabase.from("crm_quick_replies").delete().eq("id", q.id);
    if (sel?.id === q.id) startNew();
    await load();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      <div className="space-y-2">
        <Button onClick={startNew} variant="outline" className="w-full"><Plus className="size-4 mr-2" /> Nova resposta</Button>
        {items.length === 0 && <p className="text-xs text-muted-foreground p-3">Nenhuma resposta rápida ainda.</p>}
        {items.map((q) => (
          <div key={q.id} onClick={() => startEdit(q)}
            className={`p-3 rounded-lg border cursor-pointer ${sel?.id === q.id ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/40"}`}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{q.shortcut}</span>
              <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); remove(q); }}><Trash2 className="size-3.5" /></Button>
            </div>
            <div className="text-sm font-semibold mt-1">{q.title}</div>
            <p className="text-xs text-muted-foreground line-clamp-2">{q.body}</p>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Atalho</Label><Input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="/preco" /></div>
          <div className="space-y-1"><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tabela de preços" /></div>
        </div>
        <div className="space-y-1">
          <Label>Resposta</Label>
          <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Olá {{nome}}, segue nossa proposta..." />
          <p className="text-xs text-muted-foreground">Suporta tags como {"{{nome}}"}, {"{{telefone}}"}.</p>
        </div>
        <Button onClick={save}><Save className="size-4 mr-2" /> {sel ? "Salvar alterações" : "Criar resposta"}</Button>
      </div>
    </div>
  );
}