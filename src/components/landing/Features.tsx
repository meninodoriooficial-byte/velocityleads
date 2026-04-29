import { Search, Database, Download, Shield, Zap, Layers } from "lucide-react";

const features = [
  {
    icon: Search,
    title: "Busca por ramo + localização",
    desc: "Filtre por categoria, estado, cidade e até bairro para gerar listas hiper-segmentadas.",
  },
  {
    icon: Database,
    title: "Dados completos por lead",
    desc: "Nome, endereço, telefone, e-mail, site, redes sociais, avaliações e localização.",
  },
  {
    icon: Layers,
    title: "Múltiplas fontes integradas",
    desc: "Cruzamos Google Places, casadosdados e enriquecimento web em uma só busca.",
  },
  {
    icon: Download,
    title: "Exporte em CSV ou XLS",
    desc: "Baixe a lista completa e leve direto para seu CRM, planilha ou cadência.",
  },
  {
    icon: Zap,
    title: "Resultados em segundos",
    desc: "Buscas processadas em paralelo. Você recebe os primeiros leads em menos de 10s.",
  },
  {
    icon: Shield,
    title: "Pague apenas o que usar",
    desc: "Pacotes flexíveis sem mensalidade obrigatória. Compre buscas conforme a demanda.",
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
            Tudo que você precisa para prospectar mais rápido
          </h2>
          <p className="text-lg text-muted-foreground text-pretty">
            Uma plataforma completa para gerar leads B2B no Brasil sem depender de planilhas ou APIs caras.
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