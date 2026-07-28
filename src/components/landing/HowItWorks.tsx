import { Search, Send, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "1. Busque em segundos",
    desc: "Escolha o ramo, o estado, a cidade e o bairro. Em instantes, uma lista de empresas reais com contatos completos aparece na sua tela.",
  },
  {
    icon: Send,
    title: "2. Dispare a abordagem",
    desc: "Envie mensagens no WhatsApp ou campanhas de e-mail direto da plataforma — com modelos personalizados e envio em massa.",
  },
  {
    icon: TrendingUp,
    title: "3. Feche mais negócios",
    desc: "Acompanhe cada oportunidade no CRM Kanban, organize o funil e transforme leads em clientes sem deixar nada escapar.",
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
            Três passos entre você e a próxima venda
          </h2>
          <p className="text-lg text-muted-foreground text-pretty">
            Sem instalação, sem planilhas, sem curva de aprendizado. Do cadastro ao primeiro contato em menos de um minuto.
          </p>
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
