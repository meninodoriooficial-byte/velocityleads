import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

export type QuickReply = { id: string; shortcut: string; title: string; body: string };

interface Props { onPick: (q: QuickReply) => void }

export function QuickReplyPicker({ onPick }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<QuickReply[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("crm_quick_replies").select("id,shortcut,title,body").eq("user_id", user.id).order("sort_order").then(({ data }) => {
      setItems((data || []) as any);
    });
  }, [user, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" title="Respostas rápidas">
          <Zap className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-80" align="start">
        <Command>
          <CommandInput placeholder="Buscar resposta rápida..." />
          <CommandList>
            <CommandEmpty>Nenhuma resposta. Crie em "Respostas rápidas".</CommandEmpty>
            <CommandGroup>
              {items.map((q) => (
                <CommandItem key={q.id} value={`${q.shortcut} ${q.title}`} onSelect={() => { onPick(q); setOpen(false); }}>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{q.shortcut}</span>
                      <span className="font-semibold text-sm">{q.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{q.body}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}