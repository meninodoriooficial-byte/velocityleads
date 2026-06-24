import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Trash2, Save, Tag } from "lucide-react";
import { TEMPLATE_TAGS, EXAMPLE_LEAD, extractTagsUsed, renderTemplate } from "@/lib/templateTags";

type Template = {
  id: string;
  name: string;
  body: string;
  tags_used: string[];
  is_active: boolean;
};

export const MessageTemplatesManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("message_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTemplates((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [user]);

  const startNew = () => {
    setSelected(null);
    setName("");
    setBody("Olá {{primeiro_nome_socio}}, tudo bem? Vi a {{nome}} aqui em {{cidade}} e tenho uma proposta que pode ajudar bastante seu negócio. Posso te enviar mais informações?");
  };

  const startEdit = (t: Template) => {
    setSelected(t);
    setName(t.name);
    setBody(t.body);
  };

  const insertTag = (tag: string) => {
    const el = bodyRef.current;
    if (!el) { setBody((b) => b + tag); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + tag + body.slice(end);
    setBody(next);
    setTimeout(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + tag.length;
    }, 0);
  };

  const save = async () => {
    if (!user) return;
    if (!name.trim() || !body.trim()) {
      toast({ title: "Preencha nome e mensagem", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      name: name.trim(),
      body,
      tags_used: extractTagsUsed(body),
      is_active: true,
    };
    const res = selected
      ? await supabase.from("message_templates").update(payload).eq("id", selected.id)
      : await supabase.from("message_templates").insert(payload);
    setSaving(false);
    if (res.error) {
      toast({ title: "Erro ao salvar", description: res.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✓ Template salvo" });
    await fetchAll();
    if (!selected) startNew();
  };

  const remove = async (t: Template) => {
    if (!confirm(`Remover template "${t.name}"?`)) return;
    const { error } = await supabase.from("message_templates").delete().eq("id", t.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    if (selected?.id === t.id) startNew();
    await fetchAll();
  };

  const preview = renderTemplate(body || "", EXAMPLE_LEAD);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
      {/* Lista */}
      <div className="space-y-2">
        <Button onClick={startNew} className="w-full" variant="outline">
          <Plus className="size-4 mr-2" /> Novo template
        </Button>
        {loading ? (
          <p className="text-xs text-muted-foreground p-3"><Loader2 className="size-3 animate-spin inline mr-1" /> Carregando...</p>
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3">Nenhum template ainda.</p>
        ) : (
          templates.map((t) => (
            <div
              key={t.id}
              onClick={() => startEdit(t)}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${selected?.id === t.id ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/40"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm truncate">{t.name}</span>
                <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); remove(t); }}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{t.body}</p>
            </div>
          ))
        )}
      </div>

      {/* Editor */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Nome do template</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Primeira abordagem" />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Tag className="size-3.5" /> Inserir tag</Label>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_TAGS.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => insertTag(t.tag)}
                className="text-xs px-2 py-1 rounded-md bg-secondary hover:bg-secondary/70 border border-border/60 font-mono"
                title={t.label}
              >
                {t.tag}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Mensagem</Label>
          <Textarea ref={bodyRef} rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Use as tags acima. A renderização final substitui pelos dados do lead.
          </p>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            Preview <Badge variant="secondary" className="text-[10px]">Lead de exemplo</Badge>
          </div>
          <p className="text-sm whitespace-pre-wrap">{preview || <span className="text-muted-foreground italic">Escreva uma mensagem...</span>}</p>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
          {selected ? "Salvar alterações" : "Criar template"}
        </Button>
      </div>
    </div>
  );
};