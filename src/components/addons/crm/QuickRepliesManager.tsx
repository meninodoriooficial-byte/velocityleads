import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Save, AlertCircle } from "lucide-react";

type Q = { id: string; shortcut: string; title: string; body: string };

export function QuickRepliesManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Q[]>([]);
  const [sel, setSel] = useState<Q | null>(null);
  const [shortcut, setShortcut] = useState("/");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("crm_quick_replies").select("*").eq("user_id", user.id).order("sort_order");
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
      return;
    }
    setItems((data || []) as any);
  };
  useEffect(() => { load(); }, [user]);

  const startNew = () => { setSel(null); setShortcut("/"); setTitle(""); setBody(""); };
  const startEdit = (q: Q) => { setSel(q); setShortcut(q.shortcut); setTitle(q.title); setBody(q.body); };

  const save = async () => {
    if (!user) { toast({ title: "Faça login primeiro", variant: "destructive" }); return; }
    if (!shortcut.trim()) { toast({ title: "Preencha o atalho", variant: "destructive" }); return; }
    if (!body.trim()) { toast({ title: "Preencha o corpo da resposta", variant: "destructive" }); return; }

    setSaving(true);
    const payload = { user_id: user.id, shortcut: shortcut.trim(), title: title.trim() || shortcut.trim(), body: body.trim() };
    const res = sel
      ? await supabase.from("crm_quick_replies").update(payload).eq("id", sel.id)
      : await supabase.from("crm_quick_replies").insert(payload);
    setSaving(false);

    if (res.error) {
      console.error("QuickReply save error:", res.error);
      let msg = res.error.message;
      if (res.error.code === "23505") msg = "Já existe uma resposta com este atalho.";
      if (res.error.code === "42501") msg = "Permissão negada. Verifique se está logado corretamente.";
      toast({ title: "Erro ao salvar", description: msg, variant: "destructive" });
      return;
    }
    toast({ title: "✓ Salvo" });
    await load();
    startNew();
  };

  const remove = async (q: Q) => {
    if (!confirm(`Remover "${q.title}"?`)) return;
    const res = await supabase.from("crm_quick_replies").delete().eq("id", q.id);
    if (res.error) {
      toast({ title: "Erro ao remover", description: res.error.message, variant: "destructive" });
      return;
    }
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
        <Button onClick={save} disabled={saving}>
          {saving ? "Salvando..." : <><Save className="size-4 mr-2" /> {sel ? "Salvar alterações" : "Criar resposta"}</>}
        </Button>
      </div>
    </div>
  );
}
