import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, ExternalLink } from "lucide-react";

type Manual = {
  title: string;
  summary: string;
  authType: string;
  envVars: { name: string; description: string }[];
  endpoints: { method: string; url: string; description?: string }[];
  requestExample: string;
  responseExample: string;
  errors: { code: string; meaning: string; action: string }[];
  docsUrl?: string;
  docsLabel?: string;
};

const MANUALS: Record<string, Manual> = {
  google_places: {
    title: "Google Maps / Places API",
    summary:
      "Provider principal para busca de empresas (nome, endereço, telefone, site, avaliações, geo).",
    authType: "API Key (header X-Goog-Api-Key)",
    envVars: [
      {
        name: "GOOGLE_MAPS_API_KEY",
        description:
          "Cadastrada no painel admin (criptografada via pgsodium). Lida pelo backend via RPC get_api_key_decrypted.",
      },
      {
        name: "SUPABASE_SERVICE_ROLE_KEY",
        description: "Necessária na Edge Function para chamar a RPC de descriptografia.",
      },
    ],
    endpoints: [
      {
        method: "POST",
        url: "https://places.googleapis.com/v1/places:searchText",
        description: "Busca de lugares por texto livre.",
      },
      {
        method: "GET",
        url: "https://places.googleapis.com/v1/places/{placeId}",
        description: "Detalhe de um lugar.",
      },
      {
        method: "GET",
        url: "https://maps.googleapis.com/maps/api/geocode/json",
        description: "Conversão cidade/bairro → lat/lng.",
      },
    ],
    requestExample: `curl -X POST 'https://places.googleapis.com/v1/places:searchText' \\
  -H 'Content-Type: application/json' \\
  -H "X-Goog-Api-Key: $GOOGLE_MAPS_API_KEY" \\
  -H 'X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.location' \\
  -d '{
    "textQuery": "padarias em Copacabana, Rio de Janeiro",
    "languageCode": "pt-BR",
    "regionCode": "BR",
    "maxResultCount": 20
  }'`,
    responseExample: `{
  "places": [
    {
      "id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
      "displayName": { "text": "Padaria Copacabana", "languageCode": "pt-BR" },
      "formattedAddress": "Av. Nossa Sra. de Copacabana, 540 - Copacabana, RJ",
      "nationalPhoneNumber": "(21) 2255-1234",
      "websiteUri": "https://padariacopacabana.com.br",
      "rating": 4.5,
      "userRatingCount": 1287,
      "location": { "latitude": -22.9711, "longitude": -43.1822 }
    }
  ]
}`,
    errors: [
      { code: "REQUEST_DENIED / 403", meaning: "Chave inválida ou API desativada", action: "Ativar Places API (New) no Google Cloud Console" },
      { code: "OVER_QUERY_LIMIT / 429", meaning: "Cota excedida", action: "Aumentar cota ou usar chave de fallback" },
      { code: "BILLING_DISABLED", meaning: "Sem cartão vinculado", action: "Habilitar billing no projeto" },
      { code: "INVALID_ARGUMENT / 400", meaning: "Body malformado", action: "Conferir textQuery e FieldMask" },
    ],
    docsUrl: "https://developers.google.com/maps/documentation/places/web-service/overview",
    docsLabel: "Documentação oficial Places API",
  },

  casadosdados: {
    title: "casadosdados",
    summary:
      "Fonte pública brasileira para enriquecimento (CNPJ, razão social, sócios, situação cadastral). Não requer autenticação.",
    authType: "Nenhuma (fonte pública)",
    envVars: [
      {
        name: "—",
        description: "Sem variáveis. Para desativar, crie system_settings.disable_casadosdados = true.",
      },
    ],
    endpoints: [
      {
        method: "GET",
        url: "https://casadosdados.com.br/solucao/cnpj/buscador?q={query}&uf={state}&municipio={city}",
        description: "Busca textual por nome/cidade/UF.",
      },
      {
        method: "GET",
        url: "https://api.casadosdados.com.br/v2/public/cnpj/{cnpj}",
        description: "Detalhe de um CNPJ.",
      },
    ],
    requestExample: `curl 'https://api.casadosdados.com.br/v2/public/cnpj/12345678000190' \\
  -H 'User-Agent: Mozilla/5.0 (BuscaLocalFinder/1.0)' \\
  -H 'Accept: application/json'`,
    responseExample: `{
  "cnpj": "12.345.678/0001-90",
  "razao_social": "PADARIA COPACABANA LTDA",
  "nome_fantasia": "Padaria Copacabana",
  "atividade_principal": [
    { "code": "10.91-1-02", "text": "Fabricação de produtos de padaria" }
  ],
  "situacao": "ATIVA",
  "endereco": {
    "logradouro": "AV NOSSA SENHORA DE COPACABANA",
    "numero": "540",
    "bairro": "COPACABANA",
    "municipio": "RIO DE JANEIRO",
    "uf": "RJ",
    "cep": "22020-001"
  },
  "telefone": "2122551234",
  "qsa": [
    { "nome": "JOAO DA SILVA", "qualificacao": "Sócio-Administrador" }
  ]
}`,
    errors: [
      { code: "429", meaning: "Rate limit por IP", action: "Backoff exponencial; reduzir paralelismo" },
      { code: "404", meaning: "CNPJ não encontrado", action: "Tratar como sem dados" },
      { code: "503", meaning: "Site fora do ar", action: "Cair em fallback" },
      { code: "Parsing falhou", meaning: "Estrutura HTML mudou", action: "Atualizar parser na Edge Function" },
    ],
    docsUrl: "https://casadosdados.com.br",
    docsLabel: "Site casadosdados",
  },

  lovable_ai: {
    title: "Lovable AI Gateway",
    summary:
      "Usado para enriquecer/normalizar resultados (extrair proprietário, classificar setor, sumarizar reviews).",
    authType: "Bearer token (LOVABLE_API_KEY)",
    envVars: [
      {
        name: "LOVABLE_API_KEY",
        description:
          "Auto-injetado nas Edge Functions. Não cadastrar no painel admin.",
      },
    ],
    endpoints: [
      {
        method: "POST",
        url: "https://ai.gateway.lovable.dev/v1/chat/completions",
        description: "Chat completions (compatível com OpenAI). Modelo recomendado: google/gemini-2.5-flash.",
      },
    ],
    requestExample: `curl -X POST 'https://ai.gateway.lovable.dev/v1/chat/completions' \\
  -H "Authorization: Bearer $LOVABLE_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "google/gemini-2.5-flash",
    "messages": [
      { "role": "system", "content": "Extraia o nome do proprietário. Responda em JSON: {\\"owner\\": \\"...\\"}." },
      { "role": "user", "content": "Padaria do Seu João, fundada em 1985 por João da Silva." }
    ],
    "temperature": 0.2,
    "response_format": { "type": "json_object" }
  }'`,
    responseExample: `{
  "id": "chatcmpl-abc123",
  "model": "google/gemini-2.5-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\\"owner\\": \\"João da Silva\\"}"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 87, "completion_tokens": 12, "total_tokens": 99 }
}`,
    errors: [
      { code: "401", meaning: "LOVABLE_API_KEY ausente/inválida", action: "Verificar secret na Edge Function" },
      { code: "402", meaning: "Créditos esgotados", action: "Recarregar workspace Lovable" },
      { code: "429", meaning: "Rate limit do gateway", action: "Backoff + retry" },
      { code: "400", meaning: "Payload inválido", action: "Conferir model e messages" },
    ],
    docsUrl: "https://docs.lovable.dev/features/ai",
    docsLabel: "Documentação Lovable AI",
  },
};

const GENERIC_MANUAL: Manual = {
  title: "Integração genérica",
  summary:
    "Esta API ainda não possui um manual específico. Use as informações abaixo como referência geral e consulte a documentação do provider.",
  authType: "Conforme documentação do provider",
  envVars: [
    {
      name: "(definida no painel admin)",
      description:
        "A chave é armazenada criptografada em api_configs e lida pelo backend via RPC.",
    },
  ],
  endpoints: [],
  requestExample: "// Consulte a documentação oficial do provider",
  responseExample: "// Consulte a documentação oficial do provider",
  errors: [],
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
            <BookOpen className="w-5 h-5" />
            Manual de integração — {manual.title}
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

            <section>
              <h3 className="text-sm font-semibold mb-1">Autenticação</h3>
              <p className="text-sm text-muted-foreground">{manual.authType}</p>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">Variáveis de ambiente / segredos</h3>
              <div className="space-y-2">
                {manual.envVars.map((v) => (
                  <div key={v.name} className="text-sm border-l-2 border-primary/40 pl-3">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{v.name}</code>
                    <p className="text-muted-foreground mt-1">{v.description}</p>
                  </div>
                ))}
              </div>
            </section>

            {manual.endpoints.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Endpoints</h3>
                <div className="space-y-2">
                  {manual.endpoints.map((e, i) => (
                    <div key={i} className="text-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] uppercase"
                        >
                          {e.method}
                        </Badge>
                        <code className="text-xs break-all">{e.url}</code>
                      </div>
                      {e.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 ml-1">
                          {e.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold mb-2">Exemplo de request</h3>
              <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {manual.requestExample}
              </pre>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">Exemplo de response</h3>
              <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {manual.responseExample}
              </pre>
            </section>

            {manual.errors.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Erros comuns</h3>
                <div className="space-y-2">
                  {manual.errors.map((err) => (
                    <div key={err.code} className="text-xs border rounded-md p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="destructive" className="font-mono">
                          {err.code}
                        </Badge>
                        <span className="font-medium">{err.meaning}</span>
                      </div>
                      <p className="text-muted-foreground">→ {err.action}</p>
                    </div>
                  ))}
                </div>
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