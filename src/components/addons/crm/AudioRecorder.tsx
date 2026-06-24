import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";

interface Props {
  onRecorded: (blob: Blob, mime: string, durationMs: number) => void;
  disabled?: boolean;
}

export function AudioRecorder({ onRecorded, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const dur = Date.now() - startRef.current;
        onRecorded(blob, mime, dur);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recRef.current = rec;
      startRef.current = Date.now();
      setRecording(true);
      tickRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 200);
    } catch (e) {
      alert("Permita o acesso ao microfone.");
    }
  };
  const stop = () => {
    recRef.current?.stop();
    setRecording(false);
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    setElapsed(0);
  };

  if (recording) {
    return (
      <Button type="button" variant="destructive" size="icon" onClick={stop} title="Parar gravação">
        <Square className="size-4" />
        <span className="sr-only">{elapsed}s</span>
      </Button>
    );
  }
  return (
    <Button type="button" variant="ghost" size="icon" onClick={start} disabled={disabled} title="Gravar áudio">
      <Mic className="size-4" />
    </Button>
  );
}