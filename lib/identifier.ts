/**
 * Validação de identificador de schema antes de qualquer interpolação em SQL.
 *
 * Camada 3 da defesa descrita na seção 4.1 do plano. As outras são: Zod na
 * escrita pelo /admin do portal, o CHECK da tabela public.agents e a allowlist
 * carregada do banco em lib/agents.ts. Esta função é o cinto além do
 * suspensório: mesmo que alguém desative o CHECK ou escreva direto no banco,
 * a query recusa o valor aqui.
 *
 * Regra: mesma regex do CHECK do banco. Minúsculas, começa por letra, só
 * letras, dígitos e underline, de 2 a 39 caracteres. Nada de aspas, ponto,
 * espaço, maiúscula ou hífen.
 */
const IDENT_RE = /^[a-z][a-z0-9_]{1,38}$/;

export function isValidIdent(value: unknown): value is string {
  return typeof value === "string" && IDENT_RE.test(value);
}

/** Devolve o identificador validado ou lança. Nunca devolve valor não validado. */
export function assertIdent(value: unknown): string {
  if (!isValidIdent(value)) {
    // Não ecoa o valor recebido na mensagem para não vazar payload em log.
    throw new Error("Identificador de schema inválido.");
  }
  return value;
}
