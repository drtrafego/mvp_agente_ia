import "server-only";
import { getAgent } from "./agents";
import { getSessionEmail, getUserOrgs } from "./access";

/**
 * Resolve o destino das rotas antigas /[slug]/... para a árvore por empresa
 * (Tempo 2 da seção 6.3 do plano). O redirecionador é 308, permanente, e
 * preserva caminho e querystring.
 *
 * Segmentos de rota estáticos do app. O App Router já dá precedência a eles
 * sobre o segmento dinâmico /[slug], mas a lista existe como segunda barreira:
 * um dia alguém cria uma rota nova e esquece deste detalhe.
 */
const RESERVED = new Set(["org", "handler", "api", "login", "_next", "favicon.ico"]);

export type LegacyTarget =
  | { kind: "redirect"; path: string }
  /** Sem sessão, ou empresa ambígua: manda para a lista em vez de adivinhar. */
  | { kind: "list" }
  | { kind: "notFound" };

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

export async function resolveLegacyTarget(
  slug: string,
  rest: string[] = [],
  query = "",
): Promise<LegacyTarget> {
  if (!slug || RESERVED.has(slug)) return { kind: "notFound" };

  const agent = await getAgent(slug);
  if (!agent) return { kind: "notFound" };

  const email = await getSessionEmail();
  if (!email) return { kind: "list" };

  // Um agente pertence a uma empresa só (decisão A1 do plano). A checagem
  // abaixo existe para o caso de o catálogo mudar: com mais de uma empresa
  // candidata visível para o usuário, não adivinha, manda para a lista.
  const orgs = await getUserOrgs(email);
  const candidatas = orgs.filter((o) => o.id === agent.organizationId);
  if (candidatas.length !== 1) return { kind: "list" };

  const suffix = rest.length > 0 ? `/${rest.map(encodeURIComponent).join("/")}` : "";
  const path = `/org/${candidatas[0].slug}/${agent.slug}${suffix}`;
  return { kind: "redirect", path: withQuery(path, query) };
}

export function queryFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }
  return params.toString();
}
