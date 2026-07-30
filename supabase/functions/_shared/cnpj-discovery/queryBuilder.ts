// =====================================================================
// SMART CNPJ DISCOVERY — Gerador de consultas
// Local sugerido: supabase/functions/_shared/cnpj-discovery/queryBuilder.ts
// =====================================================================
import { DiscoveryInput } from "./types.ts";

const CNPJ_SITES = [
  "site:informecadastral.com.br",
  "site:consultasocio.com.br",
  "site:cnpj.biz",
  "site:econodata.com.br",
  "site:jusbrasil.com.br",
];

/**
 * Gera as combinações de consulta descritas na spec, na ordem de maior
 * para menor especificidade (mais específico primeiro = menos ruído).
 */
export function buildDiscoveryQueries(input: DiscoveryInput): string[] {
  const queries: string[] = [];
  const name = input.businessName?.trim();
  if (!name) return queries;

  const city = input.city?.trim();
  const address = input.address?.trim();
  const phone = input.phone?.trim();
  const website = input.website?.trim();

  if (name && address) queries.push(`"${name}" "${address}" CNPJ`);
  if (name && city) queries.push(`"${name}" "${city}" CNPJ`);
  if (phone) queries.push(`"${phone}" CNPJ`);
  if (website) queries.push(`"${website}" CNPJ`);
  if (name) queries.push(`"${name}" CNPJ`);

  // Combinações restritas por site: (uma consulta por domínio, reaproveitando o nome)
  for (const site of CNPJ_SITES) {
    queries.push(`"${name}" ${site}`);
  }

  return queries;
}
