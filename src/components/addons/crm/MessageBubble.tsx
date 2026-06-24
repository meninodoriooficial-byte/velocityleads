import { Badge } from "@/components/ui/badge";
import { FileText, Image as ImageIcon, Mic, Play, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export type CrmMessage = {
  id: string;
  direction: "in" | "out" | "note";
  type: string;
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_filename: string | null;
  buttons: any;
  status: string;
  error: string | null;
  created_at: string;
};

export function MessageBubble({ m }: { m: CrmMessage }) {
  const isOut = m.direction === "out";
  const isNote = m.direction === "note";

  if (isNote) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 rounded-md px-3 py-2 max-w-md text-xs">
          <div className="font-semibold mb-1 uppercase tracking-wide text-[10px]">Nota interna</div>
          <div className="whitespace-pre-wrap">{m.body}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} my-1`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm ${
          isOut ? "bg-green-600 text-white rounded-br-sm" : "bg-card border border-border/60 rounded-bl-sm"
        }`}
      >
        {m.type === "image" && m.media_url && (
          <img src={m.media_url} alt="" className="rounded-md max-h-64 mb-1" />
        )}
        {m.type === "audio" && (
          <div className="flex items-center gap-2 text-sm">
            <Mic className="size-4" />
            {m.media_url ? <audio controls src={m.media_url} className="h-8" /> : <span>[áudio]</span>}
          </div>
        )}
        {m.type === "document" && (
          <a href={m.media_url || "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm underline">
            <FileText className="size-4" /> {m.media_filename || "Documento"}
          </a>
        )}
        {m.type === "button" && m.buttons && (
          <div className="space-y-1">
            <div className="text-sm whitespace-pre-wrap">{m.body}</div>
            <div className="flex flex-wrap gap-1 pt-1">
              {(m.buttons as any[]).map((b, i) => (
                <span key={i} className={`text-[11px] px-2 py-0.5 rounded border ${isOut ? "border-white/40" : "border-border"}`}>{b.text}</span>
              ))}
            </div>
          </div>
        )}
        {(m.type === "text" || (!["image", "audio", "document", "button"].includes(m.type))) && m.body && (
          <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
        )}
        <div className={`text-[10px] mt-1 flex items-center gap-1 ${isOut ? "text-white/70 justify-end" : "text-muted-foreground"}`}>
          {m.status === "failed" && <AlertCircle className="size-3 text-red-400" />}
          {format(new Date(m.created_at), "HH:mm")}
          {isOut && m.status !== "failed" && <span className="capitalize">· {m.status}</span>}
        </div>
        {m.error && <div className="text-[10px] text-red-200 mt-1">{m.error}</div>}
      </div>
    </div>
  );
}