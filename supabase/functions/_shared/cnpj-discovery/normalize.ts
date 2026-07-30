// =====================================================================
// SMART CNPJ DISCOVERY — Normalização
// Local sugerido: supabase/functions/_shared/cnpj-discovery/normalize.ts
// =====================================================================

const CORPORATE_SUFFIXES = [
  "ltda", "me", "mei", "epp", "s/a", "sa", "eireli", "filial", "matriz",
  "comercio", "comercial", "servicos", "servico", "industria", "industrial",
];

/** Remove acentos, caixa e pontuação, para comparação robusta. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove sufixos societários (LTDA, ME, S/A, etc) do nome normalizado. */
export function stripCorporateSuffixes(normalized: string): string {
  const words = normalized.split(" ").filter((w) => !CORPORATE_SUFFIXES.includes(w));
  return words.join(" ").trim();
}

/** Nome pronto para comparação de similaridade. */
export function canonicalName(input: string | null | undefined): string {
  return stripCorporateSuffixes(normalizeText(input));
}

/** Extrai apenas dígitos de um CNPJ (aceita com ou sem máscara). */
export function onlyDigits(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

/** Valida se a string tem 14 dígitos numéricos (checagem de formato, não de dígito verificador). */
export function isCnpjFormat(value: string | null | undefined): boolean {
  return onlyDigits(value).length === 14;
}

/** Valida os dígitos verificadores de um CNPJ (algoritmo oficial). */
export function isValidCnpjChecksum(value: string | null | undefined): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    const sum = base
      .split("")
      .reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calcDigit(cnpj.slice(0, 12), w1);
  const d2 = calcDigit(cnpj.slice(0, 12) + d1, w2);

  return cnpj.endsWith(`${d1}${d2}`);
}

/** Extrai todos os CNPJs (mascarados ou não) de um texto livre, sem duplicados. */
export function extractCnpjsFromText(text: string): string[] {
  const masked = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];
  const plain = text.match(/\b\d{14}\b/g) || [];
  const all = [...masked, ...plain].map(onlyDigits);
  return Array.from(new Set(all)).filter(isCnpjFormat);
}
