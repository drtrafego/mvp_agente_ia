import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { sql } from "./db";
import { stackServerApp } from "./stack";
import { isSuperAdmin } from "./admin";
import { getAgent, listAgents, listAgentsByOrg, type Agent } from "./agents";

/**
 * Camada de acesso do app de agentes (seção 4.3 e 4.4 do plano).
 *
 * Regras duras:
 *  - superadmin vê TUDO, sempre, e o bypass acontece ANTES de qualquer
 *    consulta a public.members. A linha em members é conveniência de
 *    listagem, não é o que concede acesso.
 *  - negativa é sempre notFound() (404), nunca 403, para não confirmar a
 *    existência do agente ou da empresa de outro cliente.
 *  - o slug que vem da URL nunca entra em query interpolado, só como
 *    parâmetro bindado ($1).
 */

export type Organization = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Email da sessão Stack, em minúsculas. null quando não há sessão.
 * cache() do React: uma resolução por request, mesmo com vários asserts na
 * mesma renderização (layout mais página, ou várias server actions).
 */
export const getSessionEmail = cache(async (): Promise<string | null> => {
  if (!stackServerApp) return null;
  try {
    const user = await stackServerApp.getUser();
    const email = user?.primaryEmail?.trim().toLowerCase();
    return email || null;
  } catch {
    return null;
  }
});

/** Empresas do usuário. Superadmin recebe todas. */
export async function getUserOrgs(email?: string | null): Promise<Organization[]> {
  const sessionEmail = email ?? (await getSessionEmail());
  if (!sessionEmail) return [];

  try {
    if (isSuperAdmin(sessionEmail)) {
      return await sql.unsafe<Organization[]>(
        `select id, name, slug from public.organizations order by name`,
      );
    }
    return await sql.unsafe<Organization[]>(
      `select o.id, o.name, o.slug
       from public.organizations o
       join public.members m on m.organization_id = o.id
       where m.email = $1
       order by o.name`,
      [sessionEmail],
    );
  } catch (err) {
    // Falha fechada: sem conseguir ler as empresas, ninguem recebe empresa
    // nenhuma, nem superadmin. Adivinhar aqui abriria a porta para mostrar
    // empresa errada justamente quando o banco esta instavel.
    console.error("Falha ao ler public.organizations:", err);
    return [];
  }
}

export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  if (!slug) return null;
  try {
    const [row] = await sql.unsafe<Organization[]>(
      `select id, name, slug from public.organizations where slug = $1 limit 1`,
      [slug],
    );
    return row ?? null;
  } catch (err) {
    // Falha fechada, mesmo motivo de getUserOrgs: empresa não resolvida vira
    // 404 lá em cima, e é o resultado correto quando não dá para confirmar.
    console.error("Falha ao ler public.organizations:", err);
    return null;
  }
}

/** Agentes ativos da empresa, direto do catálogo em cache. */
export async function getOrgAgents(organizationId: string): Promise<Agent[]> {
  return listAgentsByOrg(organizationId);
}

async function isMember(
  organizationId: string,
  email: string,
): Promise<boolean> {
  try {
    const [row] = await sql.unsafe<{ ok: number }[]>(
      `select 1 as ok from public.members
       where organization_id = $1 and email = $2 limit 1`,
      [organizationId, email],
    );
    return !!row;
  } catch {
    return false;
  }
}

/** Empresa da URL, já com acesso confirmado. Qualquer falha vira 404. */
export async function assertOrgAccess(orgSlug: string): Promise<Organization> {
  const email = await getSessionEmail();
  if (!email) notFound();

  const org = await getOrgBySlug(orgSlug);
  if (!org) notFound();

  if (isSuperAdmin(email)) return org;

  if (!(await isMember(org.id, email))) notFound();
  return org;
}

/**
 * Versão que NÃO lança: devolve o agente quando o usuário da sessão pode
 * acessá lo, senão null. Existe para route handlers, onde a resposta correta é
 * um 404 explícito em vez da página de erro.
 */
export async function canAccessAgent(slug: string): Promise<Agent | null> {
  const email = await getSessionEmail();
  if (!email) return null;

  const agent = await getAgent(slug);
  if (!agent) return null;

  if (isSuperAdmin(email)) return agent;

  return (await isMember(agent.organizationId, email)) ? agent : null;
}

/**
 * Agente da URL, já com acesso confirmado. Precisa ser a PRIMEIRA linha de
 * toda server action e de toda rota que receba slug de agente do browser.
 * Sempre notFound() (404), nunca 403, para não confirmar a existência do
 * agente de outro cliente.
 */
export async function assertAgentAccess(slug: string): Promise<Agent> {
  const agent = await canAccessAgent(slug);
  if (!agent) notFound();
  return agent;
}

/**
 * Confirma que o agente pertence mesmo à empresa da URL, além do acesso.
 * É o gate completo de app/org/[org]/[slug]/layout.tsx.
 */
export async function assertOrgAgentAccess(
  orgSlug: string,
  agentSlug: string,
): Promise<{ org: Organization; agent: Agent }> {
  const org = await assertOrgAccess(orgSlug);
  const agent = await getAgent(agentSlug);
  if (!agent || agent.organizationId !== org.id) notFound();
  return { org, agent };
}
