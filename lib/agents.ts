import "server-only";
import { cache } from "react";
import { sql } from "./db";
import { assertIdent, isValidIdent } from "./identifier";

export type AgentAccent = "primary" | "secondary" | "accent";
export type AgentLeadSource = "form" | "outreach" | "none";

export type Agent = {
  id: string;
  organizationId: string;
  /** slug da empresa dona do agente, vem do join com public.organizations. */
  orgSlug: string;
  orgName: string;
  slug: string;
  /** schema_name da tabela public.agents. Nome antigo mantido de propósito. */
  schema: string;
  name: string;
  persona: string;
  description: string;
  accent: AgentAccent;
  metaPhoneNumberId: string | null;
  metaWabaId: string | null;
  metaTokenEnv: string | null;
  metaTokenCipher: string | null;
  leadSource: AgentLeadSource;
  leadSourcePageId: string | null;
  displayOrder: number;
};

type AgentRow = {
  id: string;
  organization_id: string;
  org_slug: string;
  org_name: string;
  slug: string;
  schema_name: string;
  name: string;
  persona: string | null;
  description: string | null;
  accent: string | null;
  meta_phone_number_id: string | null;
  meta_waba_id: string | null;
  meta_token_env: string | null;
  meta_token_cipher: string | null;
  lead_source: string | null;
  lead_source_page_id: string | null;
  display_order: number | null;
};

const TTL_MS = 30_000;

type CatalogState = { at: number; agents: Agent[]; bySlug: Map<string, Agent> };

/**
 * O cache vive no globalThis, e não em variável de módulo, para sobreviver a
 * uma recarga do módulo dentro da mesma instância. Numa instância quente,
 * isso é a diferença entre continuar mostrando os agentes durante uma
 * indisponibilidade curta do banco e devolver tela vazia.
 */
const globalCat = globalThis as unknown as {
  __catalogCache?: CatalogState | null;
  __catalogInflight?: Promise<CatalogState> | null;
};
let catalogCache: CatalogState | null = globalCat.__catalogCache ?? null;
let inflight: Promise<CatalogState> | null = globalCat.__catalogInflight ?? null;

/**
 * Descarta o catálogo em memória. Chamado depois de gravar a configuração de
 * um agente, senão a tela continuaria mostrando o valor antigo por até 30s.
 */
export function invalidateCatalog(): void {
  catalogCache = null;
  globalCat.__catalogCache = null;
}

function toAccent(v: string | null): AgentAccent {
  return v === "secondary" || v === "accent" ? v : "primary";
}

function toLeadSource(v: string | null): AgentLeadSource {
  return v === "form" || v === "outreach" ? v : "none";
}

function toAgent(r: AgentRow): Agent {
  return {
    id: r.id,
    organizationId: r.organization_id,
    orgSlug: r.org_slug,
    orgName: r.org_name,
    slug: r.slug,
    // assertIdent aqui: nada entra na allowlist sem passar pela regex, mesmo
    // vindo do banco. Uma linha inválida derruba só ela, não o catálogo.
    schema: assertIdent(r.schema_name),
    name: r.name,
    persona: r.persona ?? "",
    description: r.description ?? "",
    accent: toAccent(r.accent),
    metaPhoneNumberId: r.meta_phone_number_id,
    metaWabaId: r.meta_waba_id,
    metaTokenEnv: r.meta_token_env,
    metaTokenCipher: r.meta_token_cipher,
    leadSource: toLeadSource(r.lead_source),
    leadSourcePageId: r.lead_source_page_id,
    displayOrder: r.display_order ?? 0,
  };
}

function buildState(agents: Agent[]): CatalogState {
  return {
    at: Date.now(),
    agents,
    bySlug: new Map(agents.map((a) => [a.slug, a])),
  };
}

/**
 * Espera curta entre tentativas. O pool do banco satura em rajadas (os syncs
 * do servidor conectam a cada minuto), então a falha costuma durar menos de
 * um segundo. Sem repetir, uma janela dessas apaga o painel inteiro.
 */
function espera(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadCatalogComRetry(): Promise<AgentRow[]> {
  const tentativas = 3;
  let ultimoErro: unknown;
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await consultarCatalogo();
    } catch (err) {
      ultimoErro = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Catálogo: tentativa ${i}/${tentativas} falhou: ${msg}`);
      // 250ms, depois 750ms: cobre a rajada sem segurar a request.
      if (i < tentativas) await espera(i * 250 + 250 * (i - 1));
    }
  }
  throw ultimoErro;
}

async function loadCatalog(): Promise<CatalogState> {
  const rows = await loadCatalogComRetry();

  const agents: Agent[] = [];
  for (const r of rows) {
    // Linha com schema_name fora da regex é descartada em vez de derrubar o
    // catálogo inteiro. Sem isso, um registro ruim tiraria todos do ar.
    if (!isValidIdent(r.schema_name) || !isValidIdent(r.slug)) {
      console.error("Catálogo de agentes: registro ignorado por slug/schema inválido.");
      continue;
    }
    agents.push(toAgent(r));
  }

  if (agents.length === 0) throw new Error("Catálogo de agentes vazio.");
  return buildState(agents);
}

async function consultarCatalogo(): Promise<AgentRow[]> {
  return sql.unsafe<AgentRow[]>(
    `select a.id, a.organization_id, o.slug as org_slug, o.name as org_name,
            a.slug, a.schema_name, a.name, a.persona, a.description, a.accent,
            a.meta_phone_number_id, a.meta_waba_id, a.meta_token_env,
            a.meta_token_cipher, a.lead_source, a.lead_source_page_id,
            a.display_order
     from public.agents a
     join public.organizations o on o.id = a.organization_id
     where a.active = true
     order by o.slug, a.display_order, a.slug`,
  );
}

async function readCatalog(): Promise<CatalogState> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < TTL_MS) return catalogCache;
  if (inflight) return inflight;

  inflight = loadCatalog()
    .then((state) => {
      catalogCache = state;
      globalCat.__catalogCache = state;
      return state;
    })
    .catch((err) => {
      console.error("Falha ao carregar public.agents:", err);
      // Cache quente vale como ultima defesa contra uma falha momentanea do
      // banco. Sem cache, o catalogo fica vazio de proposito: e melhor a tela
      // dizer que nao ha agente do que servir um catalogo adivinhado, que
      // apontaria schema errado. NAO devolve o estado ao cache, para a proxima
      // request tentar o banco de novo em vez de esperar o TTL.
      if (catalogCache) return catalogCache;
      return buildState([]);
    })
    .finally(() => {
      inflight = null;
      globalCat.__catalogInflight = null;
    });

  globalCat.__catalogInflight = inflight;
  return inflight;
}

/** Dedupe dentro do mesmo request, por cima do cache de 30 segundos. */
const getCatalog = cache(readCatalog);

/** Todos os agentes ativos, de todas as empresas. */
export async function listAgents(): Promise<Agent[]> {
  return (await getCatalog()).agents;
}

/** Agentes ativos de uma empresa. */
export async function listAgentsByOrg(organizationId: string): Promise<Agent[]> {
  const { agents } = await getCatalog();
  return agents.filter((a) => a.organizationId === organizationId);
}

/** Resolve o agente pelo slug. Devolve null quando não existe ou está inativo. */
export async function getAgent(slug: string): Promise<Agent | null> {
  if (!slug) return null;
  const { bySlug } = await getCatalog();
  return bySlug.get(slug) ?? null;
}

/** Igual a getAgent, mas lança em vez de devolver null. */
export async function requireAgent(slug: string): Promise<Agent> {
  const agent = await getAgent(slug);
  if (!agent) throw new Error(`Agente desconhecido: ${slug}`);
  return agent;
}

/**
 * Allowlist de schemas: só schema de agente ativo do catálogo pode ir para uma
 * query, e ainda passa pela regex de identificador. O slug que vem da URL
 * nunca entra em query, só serve para resolver o agente aqui.
 */
export async function safeSchema(slug: string): Promise<string> {
  const agent = await requireAgent(slug);
  return assertIdent(agent.schema);
}
