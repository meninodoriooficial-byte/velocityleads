import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, RotateCcw, Save, Sparkles } from "lucide-react";

const SETTING_KEY = "ai_enrichment_prompt";

const DEFAULT_PROMPT = `Você é um analista de dados B2B brasileiro especializado em prospecção. Faça uma varredura abrangente em fontes públicas da internet sobre a empresa fornecida (Google, redes sociais, sites institucionais, diretórios de negócios, Receita Federal e portais especializados).

A partir do NOME e ENDEREÇO informados, encontre e retorne de forma estruturada:
- CNPJ (se possível identificar com alta confiança)
- Razão social e nome fantasia
- Site oficial
- E-mails de contato (comercial, atendimento, RH)
- Telefones adicionais (fixo e WhatsApp)
- Redes sociais: Instagram, Facebook, LinkedIn, YouTube, TikTok (URLs completas)
- Sócios / responsáveis (quando informação pública)
- Segmento e produtos/serviços principais
- Porte estimado e público-alvo
- Diferenciais competitivos
- Sugestão curta de pitch comercial personalizado

REGRAS:
1. Use apenas informações plausíveis baseadas em dados públicos conhecidos.
2. Se não tiver certeza sobre um campo, retorne null em vez de inventar.
3. URLs de redes sociais devem estar completas (https://...).
4. Priorize precisão sobre quantidade de dados.`;

export function AiPromptManager() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [initial, setInitial] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", SETTING_KEY)
      .maybeSingle();
    if (error) {
      toast({ title: "Erro ao carregar prompt", description: error.message, variant: "destructive" });
    }
    const value = (data?.setting_value as string) || DEFAULT_PROMPT;
    setPrompt(value);
    setInitial(value);
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        {
          setting_key: SETTING_KEY,
          setting_value: prompt as any,
          description:
            "Prompt usado pela IA ao enriquecer leads. Define quais dados buscar na internet a partir do nome e endereço.",
        },
        { onConflict: "setting_key" }
      );
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setInitial(prompt);
    toast({ title: "Prompt atualizado", description: "A IA usará o novo prompt nas próximas enriquecimentos." });
  }

  const dirty = prompt !== initial;
  const charCount = prompt.length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/60 bg-secondary/40 p-4 flex gap-3">
        <div className="size-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Sparkles className="size-4" />
        </div>
        <div className="text-sm text-muted-foreground leading-relaxed">
          Este prompt é enviado para a IA toda vez que um lead é enriquecido. Use-o para definir quais
          dados (redes sociais, e-mails, CNPJ, etc.) devem ser pesquisados na internet a partir do
          nome e endereço da empresa.
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="ai-prompt" className="text-sm font-semibold">
            Prompt de enriquecimento
          </Label>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {charCount} caracteres
          </span>
        </div>
        <Textarea
          id="ai-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
          rows={18}
          className="font-mono text-xs leading-relaxed min-h-[420px]"
          placeholder="Descreva como a IA deve buscar e estruturar os dados do lead..."
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPrompt(DEFAULT_PROMPT)}
          disabled={loading || saving}
        >
          <RotateCcw className="size-4" /> Restaurar padrão
        </Button>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Alterações não salvas
            </span>
          )}
          <Button onClick={save} disabled={!dirty || saving || loading} variant="volt">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar prompt
          </Button>
        </div>
      </div>
    </div>
  );
}