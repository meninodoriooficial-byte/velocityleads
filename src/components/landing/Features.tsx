import { Search, Database, Sparkles, MessageCircle, Mail, Kanban, Download, Zap, Wallet } from "lucide-react";

const features = [
  {
    icon: Search,
    title: "Busca cirúrgica por ramo + local",
    desc: "Filtre por categoria, estado, cidade e até bairro. Nada de listas genéricas: só quem realmente pode comprar de você.",
  },
  {
    icon: Database,
    title: "O contato completo, na mão",
    desc: "Nome, endereço, telefone, e-mail, site, redes sociais e avaliações. Tudo o que você precisa para abordar sem rodeios.",
  },
  {
    icon: Sparkles,
    title: "Enriquecimento com IA",
    desc: "A inteligência artificial completa os dados que faltam e qualifica cada lead — você fala com quem tem mais chance de fechar.",
  },
  {
    icon: MessageCircle,
    title: "Prospecção por WhatsApp",
    desc: "Conecte seu número, crie modelos e dispare mensagens personalizadas em massa. Do lead ao primeiro contato em um clique.",
  },
  {
    icon: Mail,
    title: "E-mail marketing integrado",
    desc: "Conecte suas contas de e-mail e envie campanhas com limites diários e rodízio inteligente para não cair em spam.",
  },
  {
    icon: Kanban,
    title: "CRM Kanban embutido",
    desc: "Arraste cada oportunidade pelo funil, acompanhe conversas e nunca mais perca um lead no meio do caminho.",
  },
  {
    icon: Download,
    title: "Exporte quando quiser",
    desc: "Baixe a lista completa em CSV ou XLS e leve para onde precisar. Seus dados são seus, sem amarras.",
  },
  {
    icon: Zap,
    title: "Resultados em segundos",
    desc: "Buscas processadas em paralelo. Os primeiros leads aparecem em menos de 10 segundos — não em horas.",
  },
  {
    icon: Wallet,
    title: "Pague só pelo que usar",
    desc: "Sem mensalidade obrigatória. Compre pacotes de buscas e ative add-ons conforme a sua demanda cresce.",
  },
];

export const Features = () => {
  return (
    <section id="features" className="py-24 relative">
      <div className="container mx-auto px-6">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-foreground bg-accent inline-block px-2.5 py-1 rounded-md mb-4">
            Recursos
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 text-balance">
            Da lista fria ao cliente fechado — tudo em um só lugar
          </h2>
          <p className="text-lg text-muted-foreground text-pretty">
            Encontrar o lead é só o começo. O VelocityLeads te leva do primeiro contato ao fechamento sem precisar de cinco ferramentas diferentes.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="group card-elevated p-6 hover:border-accent/40 hover:-translate-y-0.5 transition-all"
            >
              <div className="size-11 rounded-xl bg-accent/15 flex items-center justify-center mb-4 group-hover:bg-accent transition-colors">
                <f.icon className="size-5 text-accent-foreground" />
              </div>
              <h3 className="font-bold text-lg mb-2 tracking-tight">{f.title}</h3>
              <p className="text-sm text-muted-foreground text-pretty">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
