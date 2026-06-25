import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ListOrdered, Plus, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type BtnDef = { id: string; text: string };

interface Props { onSend: (title: string, text: string, footer: string, buttons: BtnDef[]) => void }

export function ButtonComposer({ onSend }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<BtnDef[]>([{ id: "yes", text: "Sim" }, { id: "no", text: "Não" }]);

  const submit = () => {
    if (!text.trim() || buttons.length === 0) return;
    onSend(title, text, footer, buttons);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon">
              <ListOrdered className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Enviar lista numerada (1️⃣ 2️⃣ 3️⃣)</TooltipContent>
        </Tooltip>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-3">
        <h4 className="font-semibold text-sm">Mensagem com opções numeradas</h4>
        <p className="text-xs text-muted-foreground -mt-1">
          Será enviada como texto com 1️⃣ 2️⃣ 3️⃣ (entrega garantida no WhatsApp).
        </p>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Pergunta / texto" />
        <Input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Rodapé (opcional)" />
        <div className="space-y-2">
          {buttons.map((b, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={b.text}
                onChange={(e) => setButtons((bs) => bs.map((x, j) => j === i ? { ...x, text: e.target.value, id: e.target.value.toLowerCase().replace(/\s+/g, "_") } : x))}
                placeholder={`Botão ${i + 1}`}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => setButtons((bs) => bs.filter((_, j) => j !== i))}><X className="size-4" /></Button>
            </div>
          ))}
          {buttons.length < 3 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setButtons((bs) => [...bs, { id: `btn_${bs.length}`, text: "" }])}>
              <Plus className="size-3 mr-1" /> Adicionar botão
            </Button>
          )}
        </div>
        <Button onClick={submit} className="w-full">Enviar opções</Button>
      </PopoverContent>
    </Popover>
  );
}