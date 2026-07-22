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

/**
 * Catálogo de transição, usado APENAS enquanto public.agents não existir no
 * Neon (o SQL de docs/sql/001_agentes_multi_empresa.sql ainda não foi
 * executado) ou quando a leitura do catálogo falhar e não houver cache quente.
 *
 * São exatamente os 3 agentes que estavam hardcode aqui antes, com os mesmos
 * valores do seed. Existe para que os 3 agentes de produção não saiam do ar
 * durante a migração. Remover na Fase 7, depois do seed validado.
 */
const FALLBACK_AGENTS: Agent[] = [
  {
    id: "fallback-agente24horas",
    organizationId: "fallback-agente24horas",
    orgSlug: "agente24horas",
    orgName: "Agente24horas",
    slug: "agente24horas",
    schema: "agente24horas",
    name: "Agente24Horas",
    persona: "Nina",
    description: "Atendimento 24h no WhatsApp",
    accent: "secondary",
    metaPhoneNumberId: "115216611574100",
    metaWabaId: "106071169159774",
    metaTokenEnv: "META_ACCESS_TOKEN",
    metaTokenCipher: null,
    leadSource: "form",
    leadSourcePageId: "109902140539351",
    displayOrder: 0,
  },
  {
    id: "fallback-casaldotrafego",
    organizationId: "fallback-casal-do-trafego-admin",
    orgSlug: "casal-do-trafego-admin",
    orgName: "Casal do Tráfego (Admin)",
    slug: "casaldotrafego",
    schema: "casaldotrafego",
    name: "Casal do Tráfego",
    persona: "Amanda",
    description: "SAC e qualificação de leads de tráfego pago",
    accent: "accent",
    metaPhoneNumberId: "414594695067374",
    metaWabaId: "404364559427067",
    metaTokenEnv: "META_ACCESS_TOKEN",
    metaTokenCipher: null,
    leadSource: "outreach",
    leadSourcePageId: null,
    displayOrder: 0,
  },
  {
    id: "fallback-drlucas",
    organizationId: "fallback-dr-lucas",
    orgSlug: "dr-lucas",
    orgName: "Dr. Lucas",
    slug: "drlucas",
    schema: "drlucas",
    name: "Dr. Lucas",
    persona: "Assistente",
    description: "Atendimento clínico e agendamentos",
    accent: "primary",
    metaPhoneNumberId: "1238137526046869",
    metaWabaId: "1014360307867907",
    metaTokenEnv: "META_ACCESS_TOKEN_DRLUCAS",
    metaTokenCipher: null,
    leadSource: "none",
    leadSourcePageId: null,
    displayOrder: 0,
  },
];

const TTL_MS = 30_000;

type CatalogState = { at: number; agents: Agent[]; bySlug: Map<string, Agent> };

let catalogCache: CatalogState | null = null;
let inflight: Promise<CatalogState> | null = null;

/**
 * Descarta o catálogo em memória. Chamado depois de gravar a configuração de
 * um agente, senão a tela continuaria mostrando o valor antigo por até 30s.
 */
export function invalidateCatalog(): void {
  catalogCache = null;
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

async function loadCatalog(): Promise<CatalogState> {
  const rows = await sql.unsafe<AgentRow[]>(
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

async function readCatalog(): Promise<CatalogState> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < TTL_MS) return catalogCache;
  if (inflight) return inflight;

  inflight = loadCatalog()
    .then((state) => {
      catalogCache = state;
      return state;
    })
    .catch((err) => {
      console.error("Falha ao carregar public.agents:", err);
      // Cache quente vence o fallback: dado real recente é melhor que o seed.
      if (catalogCache) return catalogCache;
      // Guarda o fallback no cache para não bater no banco a cada request
      // enquanto o catálogo não existir. O TTL faz a nova tentativa.
      const state = buildState(FALLBACK_AGENTS);
      catalogCache = state;
      return state;
    })
    .finally(() => {
      inflight = null;
    });

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
