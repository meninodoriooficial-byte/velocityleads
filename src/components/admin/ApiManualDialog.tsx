import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink, KeyRound, AlertTriangle, CheckCircle2 } from "lucide-react";

type Manual = {
  title: string;
  summary: string;
  keyName: string;
  cost: string;
  steps: { title: string; description: string }[];
  tips?: string[];
  warnings?: string[];
  docsUrl?: string;
  docsLabel?: string;
};

const MANUALS: Record<string, Manual> = {
  google_places: {
    title: "Google Maps / Places API",
    summary:
      "Provider principal para busca de empresas. Requer conta Google Cloud com billing ativo.",
    keyName: "GOOGLE_MAPS_API_KEY",
    cost:
      "Pago por uso. Google oferece US$ 200/mês de crédito grátis (≈ 11.000 buscas Text Search por mês).",
    steps: [
      {
        title: "1. Acessar o Google Cloud Console",
        description:
          "Entre em https://console.cloud.google.com com sua conta Google. Aceite os termos se for o primeiro acesso.",
      },
      {
        title: "2. Criar (ou selecionar) um projeto",
        description:
          "No topo da tela, clique no seletor de projetos → 'Novo projeto'. Dê um nome (ex.: 'busca-local-finder') e confirme.",
      },
      {
        title: "3. Ativar o billing (cobrança)",
        description:
          "Menu lateral → 'Faturamento' → vincule um cartão de crédito ao projeto. Sem isso as APIs retornam BILLING_DISABLED. Você ganha US$ 200/mês de crédito grátis.",
      },
      {
        title: "4. Ativar as APIs necessárias",
        description:
          "Vá em 'APIs e serviços' → 'Biblioteca' e ative: Places API (New), Geocoding API e Maps JavaScript API. Clique em 'Ativar' em cada uma.",
      },
      {
        title: "5. Criar a credencial (API Key)",
        description:
          "'APIs e serviços' → 'Credenciais' → 'Criar credenciais' → 'Chave de API'. A chave aparecerá em uma janela — copie imediatamente.",
      },
      {
        title: "6. Restringir a chave (recomendado)",
        description:
          "Clique em 'Editar chave de API'. Em 'Restrições de API', selecione 'Restringir chave' e marque apenas Places API (New) e Geocoding API. Salve.",
      },
      {
        title: "7. Cadastrar no painel admin",
        description:
          "Volte ao painel admin desta aplicação, clique em 'Nova chave', selecione provider 'google_places' e cole a chave. Ela será criptografada automaticamente.",
      },
    ],
    tips: [
      "Defina um orçamento de alerta no Google Cloud (Faturamento → Orçamentos) para evitar surpresas.",
      "Crie chaves separadas para dev e produção, com restrições diferentes.",
      "Após cadastrar, use o botão 'Testar API' no painel para validar a chave.",
    ],
    warnings: [
      "Nunca exponha a chave no frontend. O backend desta aplicação já cuida disso.",
      "Sem billing ativo, mesmo com a chave criada, todas as chamadas falham.",
    ],
    docsUrl: "https://developers.google.com/maps/documentation/places/web-service/get-api-key",
    docsLabel: "Guia oficial: Get API Key",
  },

  casadosdados: {
    title: "casadosdados",
    summary:
      "Fonte pública brasileira de dados de CNPJ. Não exige cadastro nem chave para o uso básico.",
    keyName: "Nenhuma chave necessária (uso público)",
    cost:
      "Gratuito para uso público. Plano pago opcional para volumes maiores e API dedicada.",
    steps: [
      {
        title: "1. Uso público — sem cadastro",
        description:
          "A integração padrão usa endpoints públicos de casadosdados.com.br. Não é preciso criar conta nem gerar chave para começar.",
      },
      {
        title: "2. (Opcional) Criar conta para plano pago",
        description:
          "Acesse https://casadosdados.com.br e clique em 'Entrar' → 'Cadastre-se'. Preencha email, senha e confirme pelo link recebido.",
      },
      {
        title: "3. (Opcional) Contratar plano API",
        description:
          "Logado, vá em 'Planos' → escolha o plano API. Após o pagamento, sua chave aparece em 'Minha conta' → 'API' → 'Token de acesso'.",
      },
      {
        title: "4. (Opcional) Cadastrar token no painel admin",
        description:
          "Se contratou plano pago, no painel admin clique em 'Nova chave', selecione provider 'casadosdados' e cole o token. Sem token, a aplicação continua usando o modo público.",
      },
    ],
    tips: [
      "Para desativar este provider sem removê-lo, use o toggle 'Ativa' no card da chave.",
      "Em caso de erro 429 (rate limit), reduza a frequência das buscas ou contrate plano pago.",
    ],
    warnings: [
      "O modo público depende da disponibilidade do site casadosdados.com.br. Para produção crítica, considere plano pago.",
    ],
    docsUrl: "https://casadosdados.com.br",
    docsLabel: "Site oficial casadosdados",
  },

  lovable_ai: {
    title: "Lovable AI Gateway",
    summary:
      "Gateway de IA da Lovable. A chave é provisionada automaticamente — você não precisa criar nada manualmente.",
    keyName: "LOVABLE_API_KEY (gerenciada pela plataforma)",
    cost:
      "Cobrado em créditos do workspace Lovable. Cada modelo tem preço diferente (ver docs).",
    steps: [
      {
        title: "1. Verificar se Lovable Cloud está ativo",
        description:
          "Este projeto já tem Lovable Cloud habilitado, então a LOVABLE_API_KEY é injetada automaticamente nas Edge Functions. Não há nada a fazer.",
      },
      {
        title: "2. Verificar saldo de créditos",
        description:
          "Acesse o workspace Lovable → Settings → Billing/Credits. Confirme que há créditos disponíveis.",
      },
      {
        title: "3. (Se necessário) Recarregar créditos",
        description:
          "No mesmo painel, clique em 'Add credits' e escolha o pacote desejado. A chave continua a mesma após a recarga.",
      },
      {
        title: "4. (Avançado) Rotacionar a chave",
        description:
          "Caso suspeite de vazamento, peça ao agente para rotacionar a LOVABLE_API_KEY. NÃO cadastre essa chave no painel admin desta aplicação — ela é usada diretamente pelo backend.",
      },
    ],
    tips: [
      "Modelos recomendados: google/gemini-2.5-flash para enriquecimento e google/gemini-2.5-flash-lite para classificações simples.",
      "Erro 402 = créditos esgotados. Erro 429 = rate limit (aguarde e tente novamente).",
    ],
    warnings: [
      "Não cadastre LOVABLE_API_KEY como provider no painel admin — ela é gerenciada pela plataforma.",
    ],
    docsUrl: "https://docs.lovable.dev/features/ai",
    docsLabel: "Documentação Lovable AI",
  },
};

const GENERIC_MANUAL: Manual = {
  title: "Integração genérica",
  summary:
    "Esta API ainda não possui um manual específico de obtenção de chave. Consulte a documentação oficial do provider.",
  keyName: "Conforme documentação do provider",
  cost: "Conforme plano contratado com o provider",
  steps: [
    {
      title: "1. Acessar o site do provider",
      description: "Crie uma conta no site oficial do serviço que deseja integrar.",
    },
    {
      title: "2. Gerar a chave de API",
      description:
        "Procure por 'API Keys', 'Tokens' ou 'Credentials' nas configurações da conta. Gere uma nova chave.",
    },
    {
      title: "3. Cadastrar no painel admin",
      description:
        "No painel admin desta aplicação, clique em 'Nova chave', selecione o provider correto e cole a chave. Ela será criptografada automaticamente.",
    },
  ],
};

interface ApiManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string | null;
  displayName: string;
}

export const ApiManualDialog = ({ open, onOpenChange, provider, displayName }: ApiManualDialogProps) => {
  const manual = (provider && MANUALS[provider]) || GENERIC_MANUAL;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            Como obter a chave — {manual.title}
          </DialogTitle>
          <DialogDescription>
            {displayName}
            {provider && (
              <Badge variant="outline" className="ml-2 font-mono text-xs">
                {provider}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-5 py-2">
            <section>
              <p className="text-sm text-muted-foreground">{manual.summary}</p>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border rounded-md p-3">
                <div className="text-xs uppercase text-muted-foreground mb-1 flex items-center gap-1">
                  <KeyRound className="w-3 h-3" /> Nome da chave
                </div>
                <code className="text-xs">{manual.keyName}</code>
              </div>
              <div className="border rounded-md p-3">
                <div className="text-xs uppercase text-muted-foreground mb-1">Custo</div>
                <p className="text-xs">{manual.cost}</p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-3">Passo a passo</h3>
              <ol className="space-y-3">
                {manual.steps.map((step, i) => (
                  <li key={i} className="border-l-2 border-primary pl-3">
                    <div className="text-sm font-medium">{step.title}</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {step.description}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            {manual.tips && manual.tips.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Dicas
                </h3>
                <ul className="space-y-1.5">
                  {manual.tips.map((tip, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-green-600">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {manual.warnings && manual.warnings.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Atenção
                </h3>
                <ul className="space-y-1.5">
                  {manual.warnings.map((w, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-amber-600">•</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {manual.docsUrl && (
              <section className="pt-2 border-t">
                <a
                  href={manual.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {manual.docsLabel || "Documentação oficial"}
                </a>
              </section>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
