import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Send, Paperclip, StickyNote, Loader2, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AudioRecorder } from "./AudioRecorder";
import { QuickReplyPicker, type QuickReply } from "./QuickReplyPicker";
import { ButtonComposer, type BtnDef } from "./ButtonComposer";
import { renderTemplate, type LeadContext } from "@/lib/templateTags";

interface Props {
  conversationId: string;
  contactName?: string | null;
  phone: string;
  onSent?: () => void;
}

async function uploadFile(userId: string, conversationId: string, file: Blob, ext: string): Promise<{ url: string; mime: string; size: number } | null> {
  const path = `${userId}/${conversationId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from("crm-media").upload(path, file, { contentType: (file as File).type || "application/octet-stream", upsert: false });
  if (up.error) { console.error("Upload error:", up.error); return null; }
  const { data, error: signedError } = await supabase.storage.from("crm-media").createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signedError) { console.error("Signed URL error:", signedError); return null; }
  return data?.signedUrl ? { url: data.signedUrl, mime: (file as File).type, size: file.size } : null;
}

export function Composer({ conversationId, contactName, phone, onSent }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const ctx: LeadContext = { nome: contactName, telefone: phone };

  const call = async (body: any) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("crm-send", { body: { conversationId, ...body } });
    setBusy(false);
    if (error || !data?.ok) {
      toast({ title: "Falha no envio", description: data?.error || error?.message, variant: "destructive" });
      return false;
    }
    onSent?.();
    return true;
  };

  const sendText = async () => {
    if (!text.trim()) return;
    const rendered = renderTemplate(text, ctx);
    if (await call({ type: "text", text: rendered })) setText("");
  };

  const sendNote = async () => {
    if (!text.trim()) return;
    if (await call({ type: "note", text })) setText("");
  };

  const pickFile = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setBusy(true);
    try {
      const ext = (f.name.split(".").pop() || "bin").toLowerCase();
      const up = await uploadFile(user.id, conversationId, f, ext);
      if (!up) { toast({ title: "Upload falhou", description: "O bucket de mídia pode não estar configurado. Entre em contato com o suporte.", variant: "destructive" }); setBusy(false); return; }
      const type = f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "document";
      await call({ type, text: renderTemplate(text, ctx), mediaUrl: up.url, mediaMime: up.mime, mediaFilename: f.name });
      setText("");
    } catch (err) {
      toast({ title: "Erro no upload", description: String(err), variant: "destructive" });
    }
    if (fileRef.current) fileRef.current.value = "";
    setBusy(false);
  };

  const onAudio = async (blob: Blob, mime: string, durationMs: number) => {
    if (!user) return;
    setBusy(true);
    try {
      const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : "mp3";
      const up = await uploadFile(user.id, conversationId, blob, ext);
      if (!up) { toast({ title: "Upload de áudio falhou", description: "O bucket de mídia pode não estar configurado.", variant: "destructive" }); setBusy(false); return; }
      await call({ type: "audio", mediaUrl: up.url, mediaMime: mime, duration_ms: durationMs });
    } catch (err) {
      toast({ title: "Erro no upload de áudio", description: String(err), variant: "destructive" });
    }
    setBusy(false);
  };

  const onQuickReply = (q: QuickReply) => {
    setText((t) => (t ? t + "\n" : "") + q.body);
  };

  const onButtons = async (title: string, text: string, footer: string, buttons: BtnDef[]) => {
    await call({ type: "buttons", text: renderTemplate(text, ctx), title, footer, buttons });
  };

  const suggestAi = async () => {
    setAiBusy(true);
    const { data, error } = await supabase.functions.invoke("crm-ai", { body: { conversationId, mode: "suggest" } });
    setAiBusy(false);
    if (error || !data?.ok) {
      toast({ title: "IA indisponível", description: data?.error || error?.message || "Erro de conexão. Verifique se a chave OPENAI_API_KEY está configurada no Supabase.", variant: "destructive" });
      return;
    }
    setText(data.text || "");
  };

  return (
    <div className="border-t border-border/60 p-3 bg-background space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
        placeholder={`Mensagem para ${contactName || phone}... (use {{nome}}, Enter envia, Shift+Enter quebra)`}
        rows={2}
        className="resize-none"
        disabled={busy}
      />
      <div className="flex items-center gap-1 flex-wrap">
        <input ref={fileRef} type="file" hidden onChange={onFile}
               accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" />
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onClick={pickFile} disabled={busy}>
                <Paperclip className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Anexar arquivo</TooltipContent>
          </Tooltip>
          <AudioRecorder onRecorded={onAudio} disabled={busy} />
          <QuickReplyPicker onPick={onQuickReply} />
          <ButtonComposer onSend={onButtons} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onClick={sendNote} disabled={busy || !text.trim()}>
                <StickyNote className="size-4 text-amber-600" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Salvar como nota interna</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onClick={suggestAi} disabled={aiBusy || busy}>
                {aiBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-purple-600" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sugerir resposta com IA</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="flex-1" />
        <Button onClick={sendText} disabled={busy || !text.trim()} className="bg-green-600 hover:bg-green-700">
          {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />}
          Enviar
        </Button>
      </div>
    </div>
  );
}
