// Tags de personalização disponíveis nos templates de mensagem.
// Centralizado para reuso entre o editor, o preview e o render server-side.

export const TEMPLATE_TAGS: { tag: string; label: string; example: string }[] = [
  { tag: "{{nome}}", label: "Nome / Empresa", example: "Padaria Aurora" },
  { tag: "{{primeiro_nome}}", label: "Primeiro nome", example: "Aurora" },
  { tag: "{{nome_socio}}", label: "Nome do sócio", example: "Carlos Silva" },
  { tag: "{{primeiro_nome_socio}}", label: "Primeiro nome do sócio", example: "Carlos" },
  { tag: "{{cidade}}", label: "Cidade", example: "São Paulo" },
  { tag: "{{estado}}", label: "Estado (UF)", example: "SP" },
  { tag: "{{bairro}}", label: "Bairro", example: "Pinheiros" },
  { tag: "{{ramo}}", label: "Ramo / Categoria", example: "Padaria" },
  { tag: "{{telefone}}", label: "Telefone", example: "(11) 99999-9999" },
  { tag: "{{email}}", label: "E-mail", example: "contato@empresa.com" },
  { tag: "{{site}}", label: "Site", example: "empresa.com" },
  { tag: "{{cnpj}}", label: "CNPJ", example: "00.000.000/0001-00" },
];

export type LeadContext = {
  nome?: string | null;
  nome_socio?: string | null;
  cidade?: string | null;
  estado?: string | null;
  bairro?: string | null;
  ramo?: string | null;
  telefone?: string | null;
  email?: string | null;
  site?: string | null;
  cnpj?: string | null;
};

function firstName(full?: string | null): string {
  if (!full) return "";
  return String(full).trim().split(/\s+/)[0] || "";
}

export function renderTemplate(body: string, ctx: LeadContext): string {
  const map: Record<string, string> = {
    nome: ctx.nome || "",
    primeiro_nome: firstName(ctx.nome),
    nome_socio: ctx.nome_socio || "",
    primeiro_nome_socio: firstName(ctx.nome_socio),
    cidade: ctx.cidade || "",
    estado: ctx.estado || "",
    bairro: ctx.bairro || "",
    ramo: ctx.ramo || "",
    telefone: ctx.telefone || "",
    email: ctx.email || "",
    site: ctx.site || "",
    cnpj: ctx.cnpj || "",
  };
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => {
    const k = String(key).toLowerCase();
    return map[k] ?? "";
  });
}

export function extractTagsUsed(body: string): string[] {
  const found = new Set<string>();
  body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => {
    found.add(String(key).toLowerCase());
    return "";
  });
  return Array.from(found);
}

export const EXAMPLE_LEAD: LeadContext = {
  nome: "Padaria Aurora",
  nome_socio: "Carlos Silva",
  cidade: "São Paulo",
  estado: "SP",
  bairro: "Pinheiros",
  ramo: "Padaria",
  telefone: "(11) 99999-9999",
  email: "contato@padariaaurora.com",
  site: "padariaaurora.com",
  cnpj: "00.000.000/0001-00",
};