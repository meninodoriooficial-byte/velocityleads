import { UserPlus, Search, Download } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    title: "1. Crie sua conta",
    desc: "Cadastro em 30 segundos. Plano básico já vem com buscas inclusas para você experimentar.",
  },
  {
    icon: Search,
    title: "2. Faça uma busca",
    desc: "Escolha o ramo, estado, cidade e bairro. Em segundos você vê empresas reais com contatos completos.",
  },
  {
    icon: Download,
    title: "3. Exporte e prospecte",
    desc: "Baixe a lista, importe no seu CRM ou cadência e comece a abordar imediatamente.",
  },
];

export const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-24 bg-secondary/40 border-y border-border/60">
      <div className="container mx-auto px-6">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3 inline-block">
            Como funciona
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 text-balance">
            Do cadastro ao primeiro lead em 1 minuto
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {steps.map((s, i) => (
            <div key={s.title} className="relative card-elevated p-7 bg-card">
              <div className="absolute -top-3 -left-3 size-9 rounded-xl bg-primary text-accent flex items-center justify-center font-bold text-sm shadow-card">
                {i + 1}
              </div>
              <s.icon className="size-7 text-accent-foreground bg-accent rounded-lg p-1.5 mb-4" />
              <h3 className="font-bold text-lg mb-2 tracking-tight">{s.title}</h3>
              <p className="text-sm text-muted-foreground text-pretty">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;