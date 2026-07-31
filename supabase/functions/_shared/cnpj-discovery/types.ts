// =====================================================================
// SMART CNPJ DISCOVERY — Tipos compartilhados
// Local sugerido no repo: supabase/functions/_shared/cnpj-discovery/types.ts
// =====================================================================

/** Dados do lead vindos de search_results, usados para gerar as consultas. */
export interface DiscoveryInput {
  placeId?: string | null;
  businessName: string;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  address?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** Um candidato a CNPJ extraído de uma fonte, antes da validação/score. */
export interface CnpjCandidate {
  cnpj: string; // sempre normalizado para 14 dígitos, sem máscara
  sourceProvider: string; // slug do provider que encontrou (ex: 'serpapi')
  sourceUrl?: string;
  rawSnippet?: string;
  // Registro oficial já obtido pelo provider (ex: CNPJá já retorna os dados
  // completos na busca). Quando presente, o orquestrador usa direto e evita
  // revalidar em outra API, preservando nome fantasia e endereço.
  record?: CnpjRecord;
}

/** Dados oficiais do CNPJ retornados por uma fonte de validação (BrasilAPI/ReceitaWS/etc). */
export interface CnpjRecord {
  cnpj: string;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  telefone?: string | null;
  website?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  categoria?: string | null;
}

/** Candidato já validado e pontuado, pronto para decisão final. */
export interface ScoredCandidate {
  cnpj: string;
  record: CnpjRecord;
  score: number; // soma dos pesos batidos (ver score.ts)
  matchedFields: string[];
  sourceProvider: string;
}

/** Resultado final da descoberta, devolvido ao caller (enrich-lead ou UI). */
export interface DiscoveryResult {
  cnpj: string | null;
  score: number | null;
  source: "cache" | "learning" | "provider" | "none";
  sourceProvider?: string;
  reason: string;
  candidatesEvaluated: number;
  durationMs: number;
  // Mensagem amigavel para o usuario final (aviso do porque nao achou ou
  // com qual confianca achou), e o nivel do aviso para colorir na UI.
  userMessage?: string;
  warningLevel?: "ok" | "info" | "warning";
}

/** Contrato único que todo provider de busca deve implementar. */
export interface ISearchProvider {
  /** Slug estável, deve bater com cnpj_discovery_providers.slug */
  readonly slug: string;

  /** Nome de exibição no Super Admin. */
  readonly displayName: string;

  /**
   * Verifica se o provider está pronto para uso (tem credencial válida,
   * seja via api_configs compartilhado ou config própria).
   */
  isConfigured(): Promise<boolean>;

  /**
   * Executa a busca e retorna candidatos a CNPJ (pode ser vazio).
   * NUNCA deve lançar exceção não tratada — erros de rede/quota devem
   * ser convertidos em ProviderError e propagados via reject controlado,
   * para o orchestrator decidir o fallback.
   */
  discover(input: DiscoveryInput, signal: AbortSignal): Promise<CnpjCandidate[]>;

  /**
   * Testa a conexão/credencial (usado pelo botão "Testar conexão").
   */
  testConnection(): Promise<{ ok: boolean; message: string; latencyMs: number }>;
}

/** Erro padronizado para decisão de fallback no orchestrator. */
export class ProviderError extends Error {
  constructor(
    public readonly providerSlug: string,
    public readonly kind: "timeout" | "quota" | "http" | "invalid_key" | "internal" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
