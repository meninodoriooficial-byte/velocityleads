import { Clock, Target, ShieldCheck, TrendingUp } from "lucide-react";

const stats = [
  { icon: Clock, value: "10s", label: "para os primeiros leads na tela" },
  { icon: Target, value: "5.570", label: "cidades e milhares de bairros mapeados" },
  { icon: TrendingUp, value: "+2.000", label: "prospecções geradas todo dia" },
  { icon: ShieldCheck, value: "100%", label: "dos dados prontos para exportar" },
];

const reasons = [
  {
    title: "Adeus, planilhas e copia-e-cola",
    desc: "Você não precisa mais caçar contato empresa por empresa no Google. Uma busca entrega a lista pronta, com tudo o que importa para vender.",
  },
  {
    title: "Segmentação que o Google não te dá",
    desc: "Filtre por bairro, não só por cidade. Foque exatamente na região onde estão os clientes que fazem sentido para o seu negócio.",
  },
  {
    title: "Do lead ao fechamento sem trocar de ferramenta",
    desc: "Busca, WhatsApp, e-mail e CRM no mesmo lugar. Menos abas abertas, menos assinaturas, mais vendas.",
  },
];

export const WhyUs = () => {
  return (
    <section className="py-24">
      <div className="container mx-auto px-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-20">
          {stats.map((s) => (
            <div key={s.label} className="card-elevated p-6 text-center">
              <s.icon className="size-6 text-accent-foreground bg-accent rounded-lg p-1 mx-auto mb-3" />
              <div className="text-3xl md:text-4xl font-extrabold tracking-tight tabular-nums mb-1">
                {s.value}
              </div>
              <div className="text-xs text-muted-foreground text-pretty">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Reasons */}
        <div className="max-w-2xl mx-auto text-center mb-14">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3 inline-block">
            Por que VelocityLeads
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 text-balance">
            Feito para quem precisa vender ontem
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {reasons.map((r) => (
            <div key={r.title} className="card-elevated p-7">
              <h3 className="font-bold text-lg mb-2 tracking-tight text-balance">{r.title}</h3>
              <p className="text-sm text-muted-foreground text-pretty">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyUs;
