import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CheckCircle2, Sparkles } from "lucide-react";

type Pkg = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  searches_limit: number;
};

export const Pricing = () => {
  const [packages, setPackages] = useState<Pkg[]>([]);

  useEffect(() => {
    supabase
      .from("search_packages")
      .select("id, name, description, price, searches_limit")
      .eq("is_active", true)
      .order("searches_limit")
      .then(({ data }) => setPackages((data as Pkg[]) || []));
  }, []);

  if (packages.length === 0) return null;

  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-6">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3 inline-block">
            Preços
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 text-balance">
            Um único cliente fechado já paga o pacote
          </h2>
          <p className="text-lg text-muted-foreground text-pretty">
            Sem mensalidade, sem fidelidade, sem pegadinha. Você compra buscas conforme a sua operação cresce — e cada busca pode virar dezenas de oportunidades.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {packages.slice(0, 3).map((pkg, i) => {
            const featured = i === 1;
            return (
              <div
                key={pkg.id}
                className={`relative rounded-2xl p-7 flex flex-col ${
                  featured
                    ? "bg-primary text-primary-foreground shadow-card scale-[1.02]"
                    : "card-elevated bg-card"
                }`}
              >
                {featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="size-3" /> Mais escolhido
                  </div>
                )}
                <h3 className="font-bold text-2xl tracking-tight mb-1">{pkg.name}</h3>
                <p className={`text-sm mb-6 ${featured ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {pkg.description || "Pacote ideal para começar"}
                </p>
                <div className="flex items-baseline gap-1.5 mb-6">
                  <span className="text-5xl font-extrabold tracking-tight tabular-nums">
                    R$ {Number(pkg.price).toFixed(0)}
                  </span>
                </div>
                <ul className="space-y-2.5 mb-8 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className={`size-4 ${featured ? "text-accent" : "text-success"}`} />
                    <strong>{pkg.searches_limit}</strong> buscas
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className={`size-4 ${featured ? "text-accent" : "text-success"}`} />
                    Exportação CSV / XLS
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className={`size-4 ${featured ? "text-accent" : "text-success"}`} />
                    Enriquecimento automático
                  </li>
                </ul>
                <Button
                  asChild
                  className={featured ? "btn-volt h-11 mt-auto" : "h-11 mt-auto"}
                  variant={featured ? "default" : "outline"}
                >
                  <Link to="/auth">Começar agora</Link>
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10 max-w-xl mx-auto text-pretty">
          Pagamento seguro via Mercado Pago. Seus créditos não expiram no meio do caminho — use no seu ritmo, quando o cliente certo aparecer.
        </p>
      </div>
    </section>
  );
};

export default Pricing;