import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, MapPin, Phone, Mail, Star, ArrowRight } from "lucide-react";

export const Hero = () => {
  return (
    <section className="relative overflow-hidden">
      {/* Background ornaments */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/40" />
        <div className="absolute -top-32 -left-32 size-96 rounded-full bg-accent/15 blur-[120px]" />
        <div className="absolute top-40 -right-32 size-96 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,hsl(var(--border)/0.4)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.4)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      </div>

      <div className="container mx-auto px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          {/* Copy */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-soft mb-6">
              <span className="size-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-semibold tracking-wide">
                Enquanto você lê isto, seu concorrente já está ligando
              </span>
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.02] mb-6 text-balance">
              Seu próximo cliente é uma{" "}
              <span className="relative inline-block">
                <span className="relative z-10">busca</span>
                <span className="absolute inset-x-0 bottom-1 h-3 bg-accent -z-0 -rotate-1" />
              </span>{" "}
              de distância.
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 text-pretty">
              Pare de garimpar contatos no Google. Escolha o <strong className="text-foreground">ramo</strong>, o <strong className="text-foreground">estado</strong>, a <strong className="text-foreground">cidade</strong> e o <strong className="text-foreground">bairro</strong> — e receba em segundos empresas reais com telefone, e-mail e WhatsApp. Depois dispare a abordagem sem sair da plataforma.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-6">
              <Button asChild size="lg" className="btn-volt h-12 px-7 text-base">
                <Link to="/auth">
                  <Sparkles className="size-4 mr-2" />
                  Gerar meus primeiros leads grátis
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-7 text-base font-semibold">
                <a href="#how-it-works">
                  Ver como funciona
                  <ArrowRight className="size-4 ml-2" />
                </a>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mb-10 lg:mb-8">
              Sem cartão de crédito • Buscas inclusas no cadastro • Comece em 30 segundos
            </p>

            <div className="flex items-center gap-6 justify-center lg:justify-start text-sm">
              <div className="flex items-center gap-1.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="size-4 fill-accent text-accent" />
                ))}
              </div>
              <span className="text-muted-foreground font-medium">
                +2.000 prospecções geradas por dia
              </span>
            </div>
          </div>

          {/* Visual mock */}
          <div className="relative">
            <div className="relative card-elevated p-5 md:p-6 max-w-md mx-auto lg:ml-auto bg-card/95 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="size-2.5 rounded-full bg-destructive/60" />
                <span className="size-2.5 rounded-full bg-warning/60" />
                <span className="size-2.5 rounded-full bg-success/60" />
                <span className="ml-3 text-xs font-medium text-muted-foreground">
                  velocityleads.app/buscar
                </span>
              </div>

              {/* Faux search */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-secondary border border-border mb-4">
                <Search className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Restaurantes • SP • São Paulo • Pinheiros</span>
              </div>

              {/* Result cards */}
              <div className="space-y-2.5">
                {[
                  { name: "Cantina Famiglia Rossi", type: "Italiano", phone: "(11) 3082-4451", rating: 4.8 },
                  { name: "Sushi Kawa Bar", type: "Japonês", phone: "(11) 3812-9120", rating: 4.7 },
                  { name: "Padaria Bella Pão", type: "Padaria", phone: "(11) 3022-1100", rating: 4.6 },
                ].map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-background border border-border/60 hover:border-accent/50 transition-colors animate-fade-in"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{r.name}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{r.type}</span>
                        <span className="flex items-center gap-1">
                          <Phone className="size-3" /> {r.phone}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-bold shrink-0 px-2 py-1 rounded-md bg-accent/15 text-accent-foreground">
                      <Star className="size-3 fill-current" /> {r.rating}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">3 de 247 resultados</span>
                <span className="font-bold text-success flex items-center gap-1">
                  <Mail className="size-3" /> 198 com e-mail
                </span>
              </div>
            </div>

            {/* Floating badge */}
            <div className="hidden md:flex absolute -bottom-4 -left-4 items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground shadow-card">
              <MapPin className="size-4 text-accent" />
              <span className="text-xs font-bold uppercase tracking-wider">Cobertura nacional</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
