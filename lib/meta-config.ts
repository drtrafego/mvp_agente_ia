import "server-only";
import type { Agent } from "./agents";
import { decryptSecret } from "./crypto";

// Config de backend da WhatsApp Cloud API por agente. phoneNumberId, wabaId,
// token e fonte de leads saíram do código e vêm do catálogo (public.agents).
export const META_GRAPH_VERSION =
  process.env.META_GRAPH_VERSION?.trim() || "v21.0";

export type MetaAgentConfig = { phoneNumberId: string; wabaId: string };

/**
 * Número oficial do agente. Só existe quando phone_number_id e waba_id estão
 * os dois preenchidos (o CHECK agents_meta_pair_ck garante isso no banco).
 */
export function getMetaConfig(
  agent: Agent | null | undefined,
): MetaAgentConfig | null {
  const phoneNumberId = agent?.metaPhoneNumberId?.trim();
  const wabaId = agent?.metaWabaId?.trim();
  if (!phoneNumberId || !wabaId) return null;
  return { phoneNumberId, wabaId };
}

/**
 * Token da Meta do agente, nesta ordem:
 *   1. meta_token_cipher decifrado com AGENTS_SECRET_KEY (agentes novos);
 *   2. env nomeada em meta_token_env (META_ACCESS_TOKEN_DRLUCAS, por exemplo);
 *   3. META_ACCESS_TOKEN.
 * Os passos 2 e 3 são o fallback que mantém os 3 agentes atuais funcionando
 * sem migrar segredo.
 */
export function getMetaToken(agent: Agent | null | undefined): string | null {
  if (!agent) return null;

  const fromCipher = decryptSecret(agent.metaTokenCipher);
  if (fromCipher) return fromCipher;

  const envName = agent.metaTokenEnv?.trim();
  if (envName) {
    const fromEnv = process.env[envName]?.trim();
    if (fromEnv) return fromEnv;
  }

  return process.env.META_ACCESS_TOKEN?.trim() || null;
}

// Fonte de leads por agente, evita misturar dados entre agentes no dashboard.
export type LeadSource =
  | { leadSource: "form"; pageId: string }
  | { leadSource: "outreach" }
  | { leadSource: "none" };

export function getLeadSource(agent: Agent | null | undefined): LeadSource {
  if (!agent) return { leadSource: "none" };
  if (agent.leadSource === "form") {
    const pageId = agent.leadSourcePageId?.trim();
    // Sem page_id não dá para escopar o formulário, então some a fonte em vez
    // de arriscar ler lead de outra página.
    return pageId ? { leadSource: "form", pageId } : { leadSource: "none" };
  }
  if (agent.leadSource === "outreach") return { leadSource: "outreach" };
  return { leadSource: "none" };
}
