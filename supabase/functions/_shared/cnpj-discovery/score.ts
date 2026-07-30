// =====================================================================
// SMART CNPJ DISCOVERY — Score de confiança
// Local sugerido: supabase/functions/_shared/cnpj-discovery/score.ts
// =====================================================================
import { DiscoveryInput, CnpjRecord, ScoredCandidate } from "./types.ts";
import { canonicalName, onlyDigits } from "./normalize.ts";
import { combinedNameSimilarity } from "./similarity.ts";

// Pesos exatamente como definidos no documento de especificação.
const WEIGHTS = {
  nome: 30,
  telefone: 30,
  website: 30,
  cidade: 20,
  cep: 20,
  rua: 20,
  categoria: 10,
  coordenadas: 40,
} as const;

const MAX_POSSIBLE_SCORE = Object.values(WEIGHTS).reduce((a, b) => a + b, 0); // 200

const NAME_SIMILARITY_THRESHOLD = 0.82;

function normalizePhone(phone: string | null | undefined): string {
  return onlyDigits(phone).replace(/^0+/, "");
}

function normalizeWebsite(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

/**
 * Calcula o score de confiança (0 a 100, normalizado) comparando o lead
 * (input) com um registro oficial retornado pelas APIs de validação.
 */
export function scoreCandidate(
  input: DiscoveryInput,
  cnpj: string,
  record: CnpjRecord,
  sourceProvider: string,
): ScoredCandidate {
  let raw = 0;
  const matchedFields: string[] = [];

  if (
    combinedNameSimilarity(canonicalName(input.businessName), canonicalName(record.razaoSocial)) >=
      NAME_SIMILARITY_THRESHOLD ||
    combinedNameSimilarity(canonicalName(input.businessName), canonicalName(record.nomeFantasia)) >=
      NAME_SIMILARITY_THRESHOLD
  ) {
    raw += WEIGHTS.nome;
    matchedFields.push("nome");
  }

  if (input.phone && record.telefone && normalizePhone(input.phone) === normalizePhone(record.telefone)) {
    raw += WEIGHTS.telefone;
    matchedFields.push("telefone");
  }

  if (input.website && record.website && normalizeWebsite(input.website) === normalizeWebsite(record.website)) {
    raw += WEIGHTS.website;
    matchedFields.push("website");
  }

  if (input.city && record.cidade && canonicalName(input.city) === canonicalName(record.cidade)) {
    raw += WEIGHTS.cidade;
    matchedFields.push("cidade");
  }

  if (input.zip && record.cep && onlyDigits(input.zip) === onlyDigits(record.cep)) {
    raw += WEIGHTS.cep;
    matchedFields.push("cep");
  }

  if (input.address && record.rua && canonicalName(input.address).includes(canonicalName(record.rua))) {
    raw += WEIGHTS.rua;
    matchedFields.push("rua");
  }

  if (input.category && record.categoria && canonicalName(input.category) === canonicalName(record.categoria)) {
    raw += WEIGHTS.categoria;
    matchedFields.push("categoria");
  }

  // Coordenadas: reservado para quando o record trouxer lat/lng geocodificado
  // do endereço oficial (comparação por distância). Fica pronto para uso
  // assim que um provider de geocoding for plugado — hoje não é usado
  // porque nenhum provider de validação retorna lat/lng diretamente.

  const normalizedScore = Math.round((raw / MAX_POSSIBLE_SCORE) * 100);

  return {
    cnpj,
    record,
    score: normalizedScore,
    matchedFields,
    sourceProvider,
  };
}

/** Aplica o corte de confiança mínima (configurável em cnpj_discovery_settings). */
export function passesConfidenceThreshold(scored: ScoredCandidate, minScore: number): boolean {
  return scored.score >= minScore;
}
