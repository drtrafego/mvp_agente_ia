"use server";

import { revalidatePath } from "next/cache";
import { sql } from "./db";
import type { Agent } from "./agents";
import { assertAgentAccess } from "./access";
import { getMetaConfig, getMetaToken } from "./meta-config";
import { sendTemplateToLeadsInternal } from "./outreach";
import type {
  OutreachSummary,
  OutreachTarget,
} from "./outreach";
import {
  sendWhatsappText,
  sendWhatsappTemplate,
  listApprovedTemplates,
  type ApprovedTemplate,
} from "./clients/meta-whatsapp";

const BASE_URL =
  process.env.HERMES_PANEL_URL ?? "https://hermes.casaldotrafego.com/agente";

export type ActionResult = {
  ok: boolean;
  error?: string;
  /** true quando o envio falhou por estar fora da janela de 24h. */
  outsideWindow?: boolean;
};

export type { ApprovedTemplate };
export type { OutreachTarget, OutreachResult, OutreachSummary } from "./outreach";

/**
 * Prefixo de rota do agente para revalidatePath. O slug da empresa sai do
 * agente resolvido pelo assert, nunca de argumento vindo do browser.
 */
function agentPath(agent: Agent, suffix = ""): string {
  return `/org/${agent.orgSlug}/${agent.slug}${suffix}`;
}

async function callPanel(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const token = process.env.PAINEL_API_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "PAINEL_API_TOKEN não configurado no servidor.",
    };
  }
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
      cache: "no-store",
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg =
        (data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : null) ?? `Erro ${res.status} no painel.`;
      return { ok: false, status: res.status, data, error: msg };
    }
    return { ok: true, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "Falha de rede ao contatar o painel do Hermes.",
    };
  }
}

/** Lista de chat_ids pausados de um agente. Nunca lança: em erro retorna []. */
export async function getPausedChatIds(slug: string): Promise<string[]> {
  await assertAgentAccess(slug);
  const res = await callPanel(
    `/api/pausados?agente=${encodeURIComponent(slug)}`,
    { method: "GET" },
  );
  if (!res.ok) return [];
  const list = (res.data as { pausados?: unknown } | null)?.pausados;
  if (!Array.isArray(list)) return [];
  return list.map((v) => String(v));
}

export async function togglePauseAction(
  slug: string,
  chatId: string | null,
  pause: boolean,
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  if (!chatId) return { ok: false, error: "Conversa sem contato vinculado." };

  const res = await callPanel(pause ? "/api/pausar" : "/api/retomar", {
    method: "POST",
    body: JSON.stringify({ agente: slug, chat_id: chatId }),
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath(agentPath(agent, "/conversas"));
  return { ok: true };
}

/**
 * Dispara o sync das conversas (state.db do bot -> Neon) sob demanda, sem
 * esperar o cron de 30 min, e revalida a tela pra re-buscar do Neon.
 */
export async function syncNowAction(slug: string): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  const res = await callPanel("/api/sync-now", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath(agentPath(agent, "/conversas"));
  return { ok: true };
}

/** Envia texto livre direto pela WhatsApp Cloud API da Meta. */
export async function sendReplyAction(
  slug: string,
  chatId: string | null,
  texto: string,
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  try {
    if (!chatId) return { ok: false, error: "Conversa sem contato vinculado." };
    const msg = texto.trim();
    if (!msg) return { ok: false, error: "Digite uma mensagem." };

    const cfg = getMetaConfig(agent);
    if (!cfg) {
      return {
        ok: false,
        error: "Este agente não tem número de WhatsApp oficial configurado.",
      };
    }
    const token = getMetaToken(agent);
    if (!token) {
      return {
        ok: false,
        error: "Este agente não tem número de WhatsApp oficial configurado.",
      };
    }

    const r = await sendWhatsappText(chatId, msg, cfg.phoneNumberId, token);
    if (!r.ok) {
      return {
        ok: false,
        error: r.error ?? "Não foi possível enviar a mensagem.",
        outsideWindow: r.outsideWindow,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao enviar a mensagem." };
  }
}

/** Envia um template aprovado (reengajamento fora da janela de 24h). */
export async function sendTemplateAction(
  slug: string,
  chatId: string | null,
  templateName: string,
  lang: string,
  params: string[] = [],
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  try {
    if (!chatId) return { ok: false, error: "Conversa sem contato vinculado." };
    if (!templateName)
      return { ok: false, error: "Selecione um template." };

    const cfg = getMetaConfig(agent);
    if (!cfg) {
      return {
        ok: false,
        error: "Este agente não tem número de WhatsApp oficial configurado.",
      };
    }
    const token = getMetaToken(agent);
    if (!token) {
      return {
        ok: false,
        error: "Este agente não tem número de WhatsApp oficial configurado.",
      };
    }

    const clean = params.map((p) => p.trim()).filter(Boolean);
    const r = await sendWhatsappTemplate(
      chatId,
      templateName,
      lang || "pt_BR",
      clean,
      cfg.phoneNumberId,
      token,
    );
    if (!r.ok) {
      return {
        ok: false,
        error: r.error ?? "Não foi possível enviar o template.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao enviar o template." };
  }
}

/** Templates APROVADOS da WABA do agente. Nunca lança: erro → []. */
export async function getApprovedTemplates(
  slug: string,
): Promise<ApprovedTemplate[]> {
  const agent = await assertAgentAccess(slug);
  try {
    const cfg = getMetaConfig(agent);
    if (!cfg) return [];
    return await listApprovedTemplates(cfg.wabaId, getMetaToken(agent));
  } catch {
    return [];
  }
}

// ---- Disparo de template em massa (outreach) ------------------------

/**
 * Server action pública do disparo: valida o ACESSO ao agente e delega para o
 * caminho interno (lib/outreach.ts), que é o mesmo usado pelo cron.
 */
export async function sendTemplateToLeads(
  slug: string,
  targets: OutreachTarget[],
  templateName: string,
  lang: string,
  sharedParams: string[] = [],
  varCount = 0,
): Promise<OutreachSummary> {
  const agent = await assertAgentAccess(slug);
  return sendTemplateToLeadsInternal(
    agent,
    targets,
    templateName,
    lang,
    sharedParams,
    varCount,
  );
}

// ---- Campanhas salvas (reuso de template + variáveis) ---------------

export type Campaign = {
  id: string;
  name: string;
  templateName: string;
  templateLang: string;
  vars: string[];
  body: string;
  createdAt: string | null;
};

// Lê template_vars de forma robusta: aceita array (formato novo) OU string
// JSON dupla-codificada (formato antigo/bugado). Nunca lança.
function parseVars(raw: unknown): string[] {
  let v: unknown = raw;
  for (let i = 0; i < 3 && typeof v === "string"; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      break;
    }
  }
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

async function ensureCampaignsTable(): Promise<void> {
  await sql.unsafe(
    `create table if not exists public.campaigns (
       id text primary key,
       agent_slug text,
       name text,
       template_name text,
       template_lang text,
       template_vars jsonb,
       template_body text,
       created_at timestamptz default now(),
       active boolean default true
     )`,
  );
  await sql.unsafe(
    `create index if not exists campaigns_agent_idx on public.campaigns (agent_slug)`,
  );
}

export async function createCampaign(
  slug: string,
  data: {
    name: string;
    templateName: string;
    lang: string;
    vars: string[];
    body: string;
  },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const agent = await assertAgentAccess(slug);
  try {
    const name = data.name?.trim();
    if (!name) return { ok: false, error: "Dê um nome à campanha." };
    if (!data.templateName)
      return { ok: false, error: "Selecione um template." };

    await ensureCampaignsTable();
    const id = `${slug}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const vars = (data.vars ?? []).map((v) => v.trim());

    await sql.unsafe(
      `insert into public.campaigns
         (id, agent_slug, name, template_name, template_lang, template_vars, template_body, active)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, true)`,
      [
        id,
        slug,
        name,
        data.templateName,
        data.lang || "pt_BR",
        vars,
        data.body ?? "",
      ],
    );
    revalidatePath(agentPath(agent, "/campaigns"));
    return { ok: true, id };
  } catch {
    return { ok: false, error: "Erro inesperado ao salvar a campanha." };
  }
}

export async function updateCampaign(
  slug: string,
  id: string,
  data: {
    name: string;
    templateName: string;
    lang: string;
    vars: string[];
    body: string;
  },
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  try {
    if (!id) return { ok: false, error: "Campanha inválida." };
    const name = data.name?.trim();
    if (!name) return { ok: false, error: "Dê um nome à campanha." };
    if (!data.templateName)
      return { ok: false, error: "Selecione um template." };

    await ensureCampaignsTable();
    const vars = (data.vars ?? []).map((v) => v.trim());

    await sql.unsafe(
      `update public.campaigns set
         name = $3,
         template_name = $4,
         template_lang = $5,
         template_vars = $6::jsonb,
         template_body = $7
       where id = $1 and agent_slug = $2`,
      [
        id,
        slug,
        name,
        data.templateName,
        data.lang || "pt_BR",
        vars,
        data.body ?? "",
      ],
    );
    revalidatePath(agentPath(agent, "/campaigns"));
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao editar a campanha." };
  }
}

export async function listCampaigns(slug: string): Promise<Campaign[]> {
  await assertAgentAccess(slug);
  try {
    const rows = await sql.unsafe<
      {
        id: string;
        name: string | null;
        template_name: string | null;
        template_lang: string | null;
        template_vars: unknown;
        template_body: string | null;
        created_at: string | null;
      }[]
    >(
      `select id, name, template_name, template_lang, template_vars,
              template_body, created_at
       from public.campaigns
       where agent_slug = $1 and active = true
       order by created_at desc nulls last`,
      [slug],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? "Campanha",
      templateName: r.template_name ?? "",
      templateLang: r.template_lang ?? "pt_BR",
      vars: parseVars(r.template_vars),
      body: r.template_body ?? "",
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function deleteCampaign(
  slug: string,
  id: string,
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  try {
    if (!id) return { ok: false, error: "Campanha inválida." };
    await sql.unsafe(
      `update public.campaigns set active = false where id = $1 and agent_slug = $2`,
      [id, slug],
    );
    revalidatePath(agentPath(agent, "/campaigns"));
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao excluir a campanha." };
  }
}

/** Dispara uma campanha salva reusando a lógica de sendTemplateToLeads. */
export async function dispatchCampaign(
  slug: string,
  campaignId: string,
  targets: OutreachTarget[],
): Promise<OutreachSummary> {
  const fail = (error: string): OutreachSummary => ({
    ok: false,
    enviados: 0,
    falhas: 0,
    resultados: [],
    error,
  });
  const agent = await assertAgentAccess(slug);
  try {
    if (!campaignId) return fail("Campanha inválida.");

    const [row] = await sql.unsafe<
      {
        template_name: string | null;
        template_lang: string | null;
        template_vars: unknown;
      }[]
    >(
      `select template_name, template_lang, template_vars
       from public.campaigns
       where id = $1 and agent_slug = $2 and active = true
       limit 1`,
      [campaignId, slug],
    );
    if (!row?.template_name) return fail("Campanha não encontrada.");

    const vars = parseVars(row.template_vars);
    // varCount = 1 (nome) + variáveis compartilhadas salvas.
    const varCount = 1 + vars.length;

    return await sendTemplateToLeadsInternal(
      agent,
      targets,
      row.template_name,
      row.template_lang ?? "pt_BR",
      vars,
      varCount,
    );
  } catch {
    return fail("Erro inesperado no disparo da campanha.");
  }
}

// ---- Disparos programados / agendados + auto-recuperação ------------

export type ScheduledDispatch = {
  id: string;
  campaignId: string | null;
  templateName: string;
  templateLang: string;
  vars: string[];
  kind: "selected" | "auto_aguardando";
  targetPhones: string[];
  scheduledAt: string | null;
  status: string;
  enabled: boolean;
  createdAt: string | null;
  ranAt: string | null;
  result: string | null;
};

export type AutoRecovery = { enabled: boolean; campaignId: string | null } | null;

function toStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

async function ensureScheduledTable(): Promise<void> {
  await sql.unsafe(
    `create table if not exists public.scheduled_dispatches (
       id text primary key,
       agent_slug text,
       campaign_id text,
       template_name text,
       template_lang text,
       template_vars jsonb,
       kind text,
       target_phones jsonb,
       scheduled_at timestamptz,
       status text,
       enabled boolean default true,
       created_at timestamptz default now(),
       ran_at timestamptz,
       result text
     )`,
  );
  await sql.unsafe(
    `create index if not exists scheduled_dispatches_agent_status_idx
       on public.scheduled_dispatches (agent_slug, status)`,
  );
}

export async function createScheduledDispatch(
  slug: string,
  input: {
    campaignId?: string | null;
    templateName: string;
    lang: string;
    vars: string[];
    phones: string[];
    scheduledAt: string | null;
  },
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  try {
    if (!getMetaConfig(agent))
      return { ok: false, error: "Agente sem número de WhatsApp oficial." };
    if (!input.templateName)
      return { ok: false, error: "Selecione um template ou campanha." };
    const phones = (input.phones ?? [])
      .map((p) => String(p).replace(/\D/g, ""))
      .filter(Boolean);
    if (phones.length === 0)
      return { ok: false, error: "Nenhum lead selecionado." };

    await ensureScheduledTable();
    const id = `${slug}:sd:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const scheduledAt = input.scheduledAt ?? new Date().toISOString();
    const vars = (input.vars ?? []).map((v) => v.trim());

    await sql`
      insert into public.scheduled_dispatches
        (id, agent_slug, campaign_id, template_name, template_lang,
         template_vars, kind, target_phones, scheduled_at, status, enabled, created_at)
      values (${id}, ${slug}, ${input.campaignId ?? null}, ${input.templateName},
              ${input.lang || "pt_BR"}, ${sql.json(vars)}, 'selected',
              ${sql.json(phones)}, ${scheduledAt}, 'pending', true, now())
    `;
    revalidatePath(agentPath(agent, "/disparos"));
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao programar o disparo." };
  }
}

export async function listScheduledDispatches(
  slug: string,
): Promise<ScheduledDispatch[]> {
  await assertAgentAccess(slug);
  try {
    const rows = await sql.unsafe<
      {
        id: string;
        campaign_id: string | null;
        template_name: string | null;
        template_lang: string | null;
        template_vars: unknown;
        kind: string | null;
        target_phones: unknown;
        scheduled_at: string | null;
        status: string | null;
        enabled: boolean | null;
        created_at: string | null;
        ran_at: string | null;
        result: string | null;
      }[]
    >(
      `select id, campaign_id, template_name, template_lang, template_vars,
              kind, target_phones, scheduled_at, status, enabled, created_at,
              ran_at, result
       from public.scheduled_dispatches
       where agent_slug = $1
       order by created_at desc nulls last`,
      [slug],
    );
    return rows.map((r) => ({
      id: r.id,
      campaignId: r.campaign_id,
      templateName: r.template_name ?? "",
      templateLang: r.template_lang ?? "pt_BR",
      vars: toStrArray(r.template_vars),
      kind: r.kind === "auto_aguardando" ? "auto_aguardando" : "selected",
      targetPhones: toStrArray(r.target_phones),
      scheduledAt: r.scheduled_at,
      status: r.status ?? "pending",
      enabled: !!r.enabled,
      createdAt: r.created_at,
      ranAt: r.ran_at,
      result: r.result,
    }));
  } catch {
    return [];
  }
}

export async function cancelScheduledDispatch(
  slug: string,
  id: string,
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  try {
    if (!id) return { ok: false, error: "Disparo inválido." };
    await sql.unsafe(
      `update public.scheduled_dispatches set status = 'canceled'
       where id = $1 and agent_slug = $2 and status = 'pending' and kind = 'selected'`,
      [id, slug],
    );
    revalidatePath(agentPath(agent, "/disparos"));
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro ao cancelar o disparo." };
  }
}

export async function getAutoRecovery(slug: string): Promise<AutoRecovery> {
  await assertAgentAccess(slug);
  try {
    const [row] = await sql.unsafe<
      { enabled: boolean | null; campaign_id: string | null }[]
    >(
      `select enabled, campaign_id from public.scheduled_dispatches
       where id = $1 and kind = 'auto_aguardando' limit 1`,
      [`${slug}:auto_aguardando`],
    );
    return row
      ? { enabled: !!row.enabled, campaignId: row.campaign_id }
      : null;
  } catch {
    return null;
  }
}

export async function setAutoRecovery(
  slug: string,
  input: { enabled: boolean; campaignId: string },
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  try {
    if (input.enabled && !input.campaignId)
      return {
        ok: false,
        error: "Escolha uma campanha para a auto-recuperação.",
      };
    await ensureScheduledTable();

    // Snapshot do template da campanha ligada.
    let tplName = "";
    let tplLang = "pt_BR";
    let vars: string[] = [];
    if (input.campaignId) {
      const [c] = await sql.unsafe<
        {
          template_name: string | null;
          template_lang: string | null;
          template_vars: unknown;
        }[]
      >(
        `select template_name, template_lang, template_vars
         from public.campaigns where id = $1 and agent_slug = $2 limit 1`,
        [input.campaignId, slug],
      );
      if (c) {
        tplName = c.template_name ?? "";
        tplLang = c.template_lang ?? "pt_BR";
        vars = toStrArray(c.template_vars);
      }
    }

    const id = `${slug}:auto_aguardando`;
    await sql`
      insert into public.scheduled_dispatches
        (id, agent_slug, campaign_id, template_name, template_lang, template_vars,
         kind, target_phones, scheduled_at, status, enabled, created_at)
      values (${id}, ${slug}, ${input.campaignId || null}, ${tplName}, ${tplLang},
              ${sql.json(vars)}, 'auto_aguardando', ${sql.json([])}, null,
              'pending', ${input.enabled}, now())
      on conflict (id) do update set
        campaign_id = excluded.campaign_id,
        template_name = excluded.template_name,
        template_lang = excluded.template_lang,
        template_vars = excluded.template_vars,
        enabled = excluded.enabled
    `;
    revalidatePath(agentPath(agent, "/disparos"));
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro ao atualizar a auto-recuperação." };
  }
}

// ---- Horários de atendimento + webhook CRM (agenda_config.json) -----

// Config vive DENTRO do container do bot (/opt/data/agenda_config.json) e é
// lida/escrita pela control API (/api/agenda-config). Mesmo padrão do pausar.
// Chaves de dia: "0"=domingo .. "6"=sábado.
export type AgendaRange = [string, string];
export type AgendaConfig = {
  timezone: string;
  slotMinutes: number;
  hours: Record<string, AgendaRange[]>;
  webhook: { enabled: boolean; url: string };
};

const EMPTY_HOURS: Record<string, AgendaRange[]> = {
  "0": [],
  "1": [],
  "2": [],
  "3": [],
  "4": [],
  "5": [],
  "6": [],
};

const DEFAULT_AGENDA: AgendaConfig = {
  timezone: "-03:00",
  slotMinutes: 30,
  hours: {
    ...EMPTY_HOURS,
    "1": [["08:00", "12:00"]],
    "2": [["08:00", "12:00"]],
    "3": [["08:00", "12:00"]],
    "4": [["08:00", "12:00"]],
    "5": [["08:00", "12:00"]],
  },
  webhook: { enabled: false, url: "" },
};

function isHHMM(s: unknown): s is string {
  if (typeof s !== "string" || s.length !== 5) return false;
  const [h, m] = s.split(":");
  const hh = Number(h);
  const mm = Number(m);
  return Number.isInteger(hh) && Number.isInteger(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

// Wire (control API, snake_case) -> AgendaConfig (camelCase), com defaults.
function normalizeAgenda(raw: unknown): AgendaConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const hoursRaw = (o.hours ?? {}) as Record<string, unknown>;
  const hours: Record<string, AgendaRange[]> = { ...EMPTY_HOURS };
  for (const k of Object.keys(EMPTY_HOURS)) {
    const list = hoursRaw[k];
    const clean: AgendaRange[] = [];
    if (Array.isArray(list)) {
      for (const r of list) {
        if (Array.isArray(r) && r.length === 2 && isHHMM(r[0]) && isHHMM(r[1]) && r[0] < r[1]) {
          clean.push([r[0], r[1]]);
        }
      }
    }
    hours[k] = clean;
  }
  const wh = (o.webhook ?? {}) as Record<string, unknown>;
  const url = String(wh.url ?? "").trim();
  let slot = Number(o.slot_minutes ?? 30);
  if (![10, 15, 20, 30, 45, 60].includes(slot)) slot = 30;
  return {
    timezone: String(o.timezone ?? "-03:00"),
    slotMinutes: slot,
    hours,
    webhook: {
      enabled: !!wh.enabled && /^https?:\/\//.test(url),
      url,
    },
  };
}

export async function getAgendaConfig(slug: string): Promise<AgendaConfig> {
  await assertAgentAccess(slug);
  try {
    const res = await callPanel(
      `/api/agenda-config?agente=${encodeURIComponent(slug)}`,
      { method: "GET" },
    );
    if (!res.ok) return DEFAULT_AGENDA;
    const cfg = (res.data as { config?: unknown } | null)?.config;
    return normalizeAgenda(cfg);
  } catch {
    return DEFAULT_AGENDA;
  }
}

export async function saveAgendaConfig(
  slug: string,
  input: AgendaConfig,
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  try {
    const normalized = normalizeAgenda({
      timezone: input.timezone,
      slot_minutes: input.slotMinutes,
      hours: input.hours,
      webhook: input.webhook,
    });
    const url = normalized.webhook.url.trim();
    if (input.webhook.enabled && !/^https?:\/\//.test(url)) {
      return {
        ok: false,
        error: "URL do webhook inválida (precisa começar com http:// ou https://).",
      };
    }
    // Monta o corpo no formato da control API (snake_case).
    const wireConfig = {
      timezone: normalized.timezone,
      slot_minutes: normalized.slotMinutes,
      hours: normalized.hours,
      webhook: {
        enabled: input.webhook.enabled && /^https?:\/\//.test(url),
        url,
      },
    };
    const res = await callPanel("/api/agenda-config", {
      method: "POST",
      body: JSON.stringify({ agente: slug, config: wireConfig }),
    });
    if (!res.ok) return { ok: false, error: res.error };
    revalidatePath(agentPath(agent, "/horarios"));
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro ao salvar os horários." };
  }
}

// ---- Bloqueios de data específica (folga/viagem/uma data só) ----------
// NÃO mexe na regra semanal. Só marca datas pontuais que o bot passa a pular.
// Mapa {"AAAA-MM-DD": "motivo"} vive no container do bot (bloqueios.json),
// escrito pela control API (/api/agenda-bloquear|desbloquear).
export type AgendaBloqueio = { data: string; motivo: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}

/** Lista as datas bloqueadas, ordenadas. Nunca lança: em erro retorna []. */
export async function getAgendaBloqueios(slug: string): Promise<AgendaBloqueio[]> {
  await assertAgentAccess(slug);
  try {
    const res = await callPanel(
      `/api/agenda-bloqueios?agente=${encodeURIComponent(slug)}`,
      { method: "GET" },
    );
    if (!res.ok) return [];
    const raw = (res.data as { bloqueios?: unknown } | null)?.bloqueios;
    if (!raw || typeof raw !== "object") return [];
    return Object.entries(raw as Record<string, unknown>)
      .filter(([d]) => ISO_DATE.test(d))
      .map(([data, motivo]) => ({ data, motivo: String(motivo ?? "") }))
      .sort((a, b) => a.data.localeCompare(b.data));
  } catch {
    return [];
  }
}

export async function blockAgendaDate(
  slug: string,
  data: string,
  motivo: string,
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  const dia = (data ?? "").trim();
  if (!isValidDate(dia)) {
    return { ok: false, error: "Data inválida. Use o seletor de data." };
  }
  try {
    const res = await callPanel("/api/agenda-bloquear", {
      method: "POST",
      body: JSON.stringify({
        agente: slug,
        data: dia,
        motivo: (motivo ?? "").trim().slice(0, 120),
      }),
    });
    if (!res.ok) return { ok: false, error: res.error };
    revalidatePath(agentPath(agent, "/horarios"));
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro ao bloquear a data." };
  }
}

export async function unblockAgendaDate(
  slug: string,
  data: string,
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  const dia = (data ?? "").trim();
  if (!isValidDate(dia)) {
    return { ok: false, error: "Data inválida." };
  }
  try {
    const res = await callPanel("/api/agenda-desbloquear", {
      method: "POST",
      body: JSON.stringify({ agente: slug, data: dia }),
    });
    if (!res.ok) return { ok: false, error: res.error };
    revalidatePath(agentPath(agent, "/horarios"));
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro ao desbloquear a data." };
  }
}

// ---- Follow-up automático (lembretes quando o lead para) ------------

// Follow-up CONTEXTUAL: a Nina escreve cada lembrete lendo a conversa.
// O dashboard só define QUANDO (os tempos) e o on/off.
export type FollowupStep = { delayMinutes: number };
export type FollowupConfig = { enabled: boolean; steps: FollowupStep[] };

const DEFAULT_FOLLOWUP_STEPS: FollowupStep[] = [
  { delayMinutes: 30 },
  { delayMinutes: 120 },
  { delayMinutes: 240 },
  { delayMinutes: 720 },
  { delayMinutes: 1440 },
];

async function ensureFollowupTables(): Promise<void> {
  await sql.unsafe(
    `create table if not exists public.followup_config (
       agent_slug text primary key,
       enabled boolean default false,
       steps jsonb,
       updated_at timestamptz default now()
     )`,
  );
  await sql.unsafe(
    `create table if not exists public.followup_sent (
       id text primary key,
       agent_slug text,
       chat_id text,
       step_index int,
       based_on_ts timestamptz,
       sent_at timestamptz default now(),
       status text
     )`,
  );
  await sql.unsafe(
    `create unique index if not exists followup_sent_uniq
       on public.followup_sent (agent_slug, chat_id, step_index, based_on_ts)`,
  );
}

function sanitizeSteps(steps: unknown): FollowupStep[] {
  if (!Array.isArray(steps)) return [];
  const seen = new Set<number>();
  const out: FollowupStep[] = [];
  for (const s of steps) {
    const o = (s ?? {}) as { delayMinutes?: unknown };
    const delayMinutes = Math.max(1, Math.round(Number(o.delayMinutes) || 0));
    if (delayMinutes <= 0 || seen.has(delayMinutes)) continue;
    seen.add(delayMinutes);
    out.push({ delayMinutes });
  }
  return out.sort((a, b) => a.delayMinutes - b.delayMinutes);
}

export async function getFollowupConfig(
  slug: string,
): Promise<FollowupConfig> {
  const fallback: FollowupConfig = {
    enabled: false,
    steps: DEFAULT_FOLLOWUP_STEPS,
  };
  await assertAgentAccess(slug);
  try {
    await ensureFollowupTables();
    const [row] = await sql.unsafe<
      { enabled: boolean | null; steps: unknown }[]
    >(
      `select enabled, steps from public.followup_config where agent_slug = $1 limit 1`,
      [slug],
    );
    if (!row) {
      // Semeia o default na primeira vez (desligado).
      await sql`
        insert into public.followup_config (agent_slug, enabled, steps, updated_at)
        values (${slug}, false, ${sql.json(DEFAULT_FOLLOWUP_STEPS)}, now())
        on conflict (agent_slug) do nothing
      `;
      return fallback;
    }
    const steps = sanitizeSteps(row.steps);
    return {
      enabled: !!row.enabled,
      steps: steps.length ? steps : DEFAULT_FOLLOWUP_STEPS,
    };
  } catch {
    return fallback;
  }
}

export async function saveFollowupConfig(
  slug: string,
  input: { enabled: boolean; steps: FollowupStep[] },
): Promise<ActionResult> {
  const agent = await assertAgentAccess(slug);
  try {
    if (!getMetaConfig(agent))
      return { ok: false, error: "Agente sem número de WhatsApp oficial." };
    const steps = sanitizeSteps(input.steps);
    if (input.enabled && steps.length === 0)
      return {
        ok: false,
        error: "Adicione ao menos um tempo de follow-up.",
      };

    await ensureFollowupTables();
    await sql`
      insert into public.followup_config (agent_slug, enabled, steps, updated_at)
      values (${slug}, ${input.enabled}, ${sql.json(steps)}, now())
      on conflict (agent_slug) do update set
        enabled = excluded.enabled,
        steps = excluded.steps,
        updated_at = now()
    `;
    revalidatePath(agentPath(agent, "/disparos"));
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro ao salvar o follow-up." };
  }
}
