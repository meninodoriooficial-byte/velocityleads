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
function extractCep(s?: string | null): string {
  if (!s) return "";
  const m = s.match(/\d{5}-?\d{3}/);
  return m ? m[0].replace(/\D/g, "") : "";
}

function stripStreetType(s: string): string {
  return canonicalName(s).replace(
    /^(rua|r|avenida|av|alameda|al|travessa|tv|praca|rodovia|rod|estrada|estr|largo|viela|via|servidao|quadra|q)\s+/,
    "",
  );
}

function streetMatches(address: string, recordStreet: string): boolean {
  const core = stripStreetType(recordStreet);
  if (!core || core.length < 4) return false;
  return canonicalName(address).includes(core);
}

function nameMatches(inputName: string, razao?: string | null, fantasia?: string | null): boolean {
  const inp = canonicalName(inputName);
  if (!inp) return false;
  for (const cand of [canonicalName(razao), canonicalName(fantasia)]) {
    if (!cand) continue;
    if (combinedNameSimilarity(inp, cand) >= NAME_SIMILARITY_THRESHOLD) return true;
    // Tolerância "nome fantasia + bairro/cidade": se todos os tokens
    // significativos do nome mais curto aparecem no mais longo, é match.
    const a = inp.split(/\s+/).filter((w) => w.length >= 4);
    const b = cand.split(/\s+/).filter((w) => w.length >= 4);
    if (a.length && b.length) {
      const [short, long] = a.length <= b.length ? [a, b] : [b, a];
      if (short.every((t) => long.some((x) => x.includes(t) || t.includes(x)))) return true;
    }
  }
  return false;
}

/**
 * Calcula o score de confiança (0 a 100) comparando o lead (input) com um
 * registro oficial. Normaliza APENAS pelos campos comparáveis (que existem
 * tanto no lead quanto no registro), em vez de dividir por um teto fixo que
 * incluía campos nunca preenchidos (coordenadas/website) e tornava quase
 * impossível atingir a confiança mínima.
 */
export function scoreCandidate(
  input: DiscoveryInput,
  cnpj: string,
  record: CnpjRecord,
  sourceProvider: string,
): ScoredCandidate {
  let raw = 0;
  let applicableMax = 0;
  const matchedFields: string[] = [];

  // Valores efetivos do lead: usa os campos estruturados quando existem,
  // senão extrai do endereço em texto (o enrich-lead só manda o endereço).
  const inputZip = onlyDigits(input.zip || "") || extractCep(input.address);
  const addressHay = canonicalName(input.address || "");

  // NOME (compara com razão social E nome fantasia)
  if (input.businessName && (record.razaoSocial || record.nomeFantasia)) {
    applicableMax += WEIGHTS.nome;
    if (nameMatches(input.businessName, record.razaoSocial, record.nomeFantasia)) {
      raw += WEIGHTS.nome;
      matchedFields.push("nome");
    }
  }

  // TELEFONE
  if (input.phone && record.telefone) {
    applicableMax += WEIGHTS.telefone;
    if (normalizePhone(input.phone) === normalizePhone(record.telefone)) {
      raw += WEIGHTS.telefone;
      matchedFields.push("telefone");
    }
  }

  // WEBSITE
  if (input.website && record.website) {
    applicableMax += WEIGHTS.website;
    if (normalizeWebsite(input.website) === normalizeWebsite(record.website)) {
      raw += WEIGHTS.website;
      matchedFields.push("website");
    }
  }

  // CIDADE (usa campo estruturado ou procura no endereço em texto)
  if (record.cidade && (input.city || input.address)) {
    applicableMax += WEIGHTS.cidade;
    const rc = canonicalName(record.cidade);
    const cityHit = input.city
      ? canonicalName(input.city) === rc
      : (!!rc && addressHay.includes(rc));
    if (cityHit) {
      raw += WEIGHTS.cidade;
      matchedFields.push("cidade");
    }
  }

  // CEP
  if (record.cep && inputZip) {
    applicableMax += WEIGHTS.cep;
    if (inputZip === onlyDigits(record.cep)) {
      raw += WEIGHTS.cep;
      matchedFields.push("cep");
    }
  }

  // RUA (tolera abreviação de tipo de logradouro: "R." vs "Rua")
  if (record.rua && input.address) {
    applicableMax += WEIGHTS.rua;
    if (streetMatches(input.address, record.rua)) {
      raw += WEIGHTS.rua;
      matchedFields.push("rua");
    }
  }

  // CATEGORIA
  if (input.category && record.categoria) {
    applicableMax += WEIGHTS.categoria;
    if (canonicalName(input.category) === canonicalName(record.categoria)) {
      raw += WEIGHTS.categoria;
      matchedFields.push("categoria");
    }
  }

  const normalizedScore = applicableMax > 0 ? Math.round((raw / applicableMax) * 100) : 0;

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
