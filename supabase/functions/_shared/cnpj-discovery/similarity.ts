// =====================================================================
// SMART CNPJ DISCOVERY — Similaridade textual
// Local sugerido: supabase/functions/_shared/cnpj-discovery/similarity.ts
// =====================================================================

/** Distância de Levenshtein (número de edições). */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = Array(b.length + 1).fill(0).map((_, i) => i);
  const curr = Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** Similaridade normalizada de Levenshtein (0 a 1). */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/** Similaridade de Jaro. */
function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const matchDistance = Math.floor(Math.max(aLen, bLen) / 2) - 1;
  const aMatches = new Array(aLen).fill(false);
  const bMatches = new Array(bLen).fill(false);

  let matches = 0;
  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, bLen);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < aLen; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (
    (matches / aLen + matches / bLen + (matches - transpositions / 2) / matches) / 3
  );
}

/** Similaridade Jaro-Winkler (0 a 1), com bônus para prefixo comum. */
export function jaroWinklerSimilarity(a: string, b: string, prefixScale = 0.1): number {
  const jaro = jaroSimilarity(a, b);
  let prefixLength = 0;
  const maxPrefix = 4;
  for (let i = 0; i < Math.min(maxPrefix, a.length, b.length); i++) {
    if (a[i] === b[i]) prefixLength++;
    else break;
  }
  return jaro + prefixLength * prefixScale * (1 - jaro);
}

/** Similaridade de cosseno entre dois textos, usando frequência de tokens. */
export function cosineSimilarity(a: string, b: string): number {
  const tokensA = a.split(/\s+/).filter(Boolean);
  const tokensB = b.split(/\s+/).filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const freq = (tokens: string[]) => {
    const map = new Map<string, number>();
    for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
    return map;
  };

  const freqA = freq(tokensA);
  const freqB = freq(tokensB);
  const allTokens = new Set([...freqA.keys(), ...freqB.keys()]);

  let dot = 0, normA = 0, normB = 0;
  for (const t of allTokens) {
    const va = freqA.get(t) || 0;
    const vb = freqB.get(t) || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Score combinado (0 a 1) usado para decidir se dois nomes são a mesma empresa.
 * Combina as três métricas com pesos — Jaro-Winkler pesa mais para nomes
 * curtos/próprios, cosine pesa mais para nomes com várias palavras.
 */
export function combinedNameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const lev = levenshteinSimilarity(a, b);
  const jw = jaroWinklerSimilarity(a, b);
  const cos = cosineSimilarity(a, b);
  return lev * 0.3 + jw * 0.4 + cos * 0.3;
}
