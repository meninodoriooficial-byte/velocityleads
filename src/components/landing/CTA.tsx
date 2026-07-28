import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export const CTA = () => {
  return (
    <section className="py-24">
      <div className="container mx-auto px-6">
        <div className="relative overflow-hidden rounded-3xl bg-primary p-10 md:p-16 text-center text-primary-foreground">
          <div className="absolute -top-20 -right-20 size-72 rounded-full border-[14px] border-accent/15" />
          <div className="absolute -bottom-24 -left-16 size-72 rounded-full border-[14px] border-accent/10" />
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 text-balance">
              Cada dia sem prospectar é um cliente que fecha com o concorrente
            </h2>
            <p className="text-lg text-primary-foreground/75 mb-8 text-pretty">
              Crie sua conta agora e gere as primeiras listas de leads ainda hoje. Leva menos tempo do que você gastou lendo esta página.
            </p>
            <Button asChild size="lg" className="btn-volt h-12 px-8 text-base">
              <Link to="/auth">
                Começar grátis agora <ArrowRight className="size-4 ml-2" />
              </Link>
            </Button>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-6 text-sm text-primary-foreground/70">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-accent" /> Sem cartão de crédito
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-accent" /> Buscas inclusas
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-accent" /> Cancele quando quiser
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
