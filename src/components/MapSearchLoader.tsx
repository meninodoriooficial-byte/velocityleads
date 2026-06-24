import { useEffect, useState } from "react";
import { MapPin, Search, Database, Sparkles, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface MapSearchLoaderProps {
  category?: string;
  city?: string;
  state?: string;
  neighborhood?: string;
  /** When true, renders as fullscreen overlay; otherwise inline panel */
  overlay?: boolean;
}

const STEPS = [
  { icon: MapPin, label: "Localizando região no mapa" },
  { icon: Search, label: "Consultando Google Maps" },
  { icon: Database, label: "Cruzando bases públicas" },
  { icon: Sparkles, label: "Enriquecendo leads" },
];

export function MapSearchLoader({
  category,
  city,
  state,
  neighborhood,
  overlay = true,
}: MapSearchLoaderProps) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % STEPS.length);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  // Barra de progresso progressiva: avança rápido no início e desacelera,
  // aproximando-se de 95% até a busca concluir (quando o componente desmonta).
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return 95;
        const remaining = 95 - p;
        const inc = Math.max(0.4, remaining * 0.04);
        return Math.min(95, p + inc);
      });
    }, 200);
    return () => clearInterval(id);
  }, []);

  const where = [city, state].filter(Boolean).join("/") + (neighborhood ? ` • ${neighborhood}` : "");

  const panel = (
    <div className="surface-raised w-full max-w-md p-7 text-center animate-scale-in">
      {/* Radar */}
      <div className="relative w-28 h-28 mx-auto mb-5">
        <div className="radar absolute inset-0 rounded-full" />
        <div className="absolute inset-3 rounded-full bg-accent/15 animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-12 rounded-full bg-primary text-accent flex items-center justify-center shadow-[0_8px_24px_-8px_hsl(240_6%_6%/0.4)]">
            <MapPin className="w-6 h-6" fill="currentColor" />
          </div>
        </div>
      </div>

      <h3 className="text-lg font-bold tracking-tight">Mapeando empresas…</h3>
      <p className="text-sm text-muted-foreground mt-1">
        {category ? <span className="font-semibold text-foreground">{category}</span> : "Buscando leads"}
        {where ? <> em <span className="font-medium">{where}</span></> : null}
      </p>

      {/* Barra de progresso real */}
      <div className="mt-5 space-y-1.5">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground font-medium">
          <span>Capturando dados…</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Steps */}
      <ul className="mt-5 space-y-2 text-left">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <li
              key={s.label}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                active
                  ? "bg-accent/10 border border-accent/30"
                  : done
                  ? "opacity-60"
                  : "opacity-50"
              }`}
            >
              <div
                className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : done
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Icon className={`w-4 h-4 ${active ? "animate-pulse" : ""}`} />
                )}
              </div>
              <span className={`text-sm ${active ? "font-semibold" : "font-medium"}`}>
                {s.label}
              </span>
              {active && (
                <span className="ml-auto flex gap-0.5">
                  <span className="size-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="size-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: "120ms" }} />
                  <span className="size-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: "240ms" }} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (!overlay) return panel;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-md animate-fade-in p-4"
      role="status"
      aria-live="polite"
    >
      {panel}
    </div>
  );
}

export default MapSearchLoader;