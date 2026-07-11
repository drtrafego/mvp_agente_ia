"use server";

import { revalidatePath } from "next/cache";
import { sql } from "./db";
import { getAgent } from "./agents";
import { getMetaConfig } from "./meta-config";
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
  if (!getAgent(slug)) return [];
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
  if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
  if (!chatId) return { ok: false, error: "Conversa sem contato vinculado." };

  const res = await callPanel(pause ? "/api/pausar" : "/api/retomar", {
    method: "POST",
    body: JSON.stringify({ agente: slug, chat_id: chatId }),
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath(`/${slug}/conversas`);
  return { ok: true };
}

/** Envia texto livre direto pela WhatsApp Cloud API da Meta. */
export async function sendReplyAction(
  slug: string,
  chatId: string | null,
  texto: string,
): Promise<ActionResult> {
  try {
    if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
    if (!chatId) return { ok: false, error: "Conversa sem contato vinculado." };
    const msg = texto.trim();
    if (!msg) return { ok: false, error: "Digite uma mensagem." };

    const cfg = getMetaConfig(slug);
    if (!cfg) {
      return {
        ok: false,
        error: "Este agente não tem número de WhatsApp oficial configurado.",
      };
    }

    const r = await sendWhatsappText(chatId, msg, cfg.phoneNumberId);
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
  try {
    if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
    if (!chatId) return { ok: false, error: "Conversa sem contato vinculado." };
    if (!templateName)
      return { ok: false, error: "Selecione um template." };

    const cfg = getMetaConfig(slug);
    if (!cfg) {
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
  try {
    const cfg = getMetaConfig(slug);
    if (!cfg) return [];
    return await listApprovedTemplates(cfg.wabaId);
  } catch {
    return [];
  }
}

// ---- Disparo de template em massa (outreach) ------------------------

export type OutreachTarget = { phone: string; name: string };
export type OutreachResult = {
  phone: string;
  name: string;
  ok: boolean;
  error?: string;
};
export type OutreachSummary = {
  ok: boolean;
  enviados: number;
  falhas: number;
  resultados: OutreachResult[];
  error?: string;
};

async function ensureOutreachTable(): Promise<void> {
  await sql.unsafe(
    `create table if not exists public.outreach_sent (
       id text primary key,
       agent_slug text,
       phone_norm text,
       lead_name text,
       template_name text,
       sent_at timestamptz default now(),
       status text,
       message_id text,
       error text
     )`,
  );
  await sql.unsafe(
    `create index if not exists outreach_sent_agent_phone_idx
       on public.outreach_sent (agent_slug, phone_norm)`,
  );
}

/**
 * Dispara um template aprovado para uma lista de leads (1º toque em quem
 * preencheu o form mas não conversou). Envio direto pela Meta, com delay entre
 * mensagens; grava cada resultado em public.outreach_sent. Nunca lança 500.
 */
export async function sendTemplateToLeads(
  slug: string,
  targets: OutreachTarget[],
  templateName: string,
  lang: string,
  sharedParams: string[] = [],
  varCount = 0,
): Promise<OutreachSummary> {
  const fail = (error: string): OutreachSummary => ({
    ok: false,
    enviados: 0,
    falhas: 0,
    resultados: [],
    error,
  });
  try {
    if (!getAgent(slug)) return fail("Agente desconhecido.");
    const cfg = getMetaConfig(slug);
    if (!cfg)
      return fail("Este agente não tem número de WhatsApp oficial configurado.");
    if (!templateName) return fail("Selecione um template.");
    if (!Array.isArray(targets) || targets.length === 0)
      return fail("Nenhum lead selecionado.");

    // {{1}} = nome do lead (por lead); {{2}}..{{n}} = compartilhados.
    const shared = sharedParams.map((p) => p.trim());
    if (varCount > 1 && shared.length < varCount - 1) {
      return fail(
        `Preencha as ${varCount - 1} variáveis compartilhadas do template.`,
      );
    }
    const sharedForTemplate = varCount > 1 ? shared.slice(0, varCount - 1) : [];

    try {
      await ensureOutreachTable();
    } catch {
      // se não der pra criar a tabela, segue o envio mesmo sem rastreio
    }

    const resultados: OutreachResult[] = [];
    let enviados = 0;
    let falhas = 0;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const name = t?.name ?? "";
      const phone = (t?.phone ?? "").replace(/\D/g, "");
      if (!phone) {
        falhas++;
        resultados.push({ phone: t?.phone ?? "", name, ok: false, error: "Telefone inválido." });
        continue;
      }

      // Monta bodyParams por lead: [nome, ...compartilhados]. Sem variáveis → [].
      const bodyParams =
        varCount === 0
          ? []
          : [name.trim() || "tudo bem", ...sharedForTemplate];

      const r = await sendWhatsappTemplate(
        phone,
        templateName,
        lang || "pt_BR",
        bodyParams,
        cfg.phoneNumberId,
      );

      const id = `${slug}:${phone}:${Date.now()}:${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      try {
        await sql.unsafe(
          `insert into public.outreach_sent
             (id, agent_slug, phone_norm, lead_name, template_name, status, message_id, error)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            slug,
            phone,
            name || null,
            templateName,
            r.ok ? "sent" : "failed",
            r.messageId || null,
            r.ok ? null : r.error ?? null,
          ],
        );
      } catch {
        // rastreio é best-effort; não interrompe o disparo
      }

      if (r.ok) {
        enviados++;
        resultados.push({ phone, name, ok: true });
      } else {
        falhas++;
        resultados.push({ phone, name, ok: false, error: r.error });
      }

      if (i < targets.length - 1) {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }

    revalidatePath(`/${slug}/leads`);
    return { ok: true, enviados, falhas, resultados };
  } catch {
    return fail("Erro inesperado no disparo.");
  }
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
  try {
    if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
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
    revalidatePath(`/${slug}/campaigns`);
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
  try {
    if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
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
    revalidatePath(`/${slug}/campaigns`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao editar a campanha." };
  }
}

export async function listCampaigns(slug: string): Promise<Campaign[]> {
  try {
    if (!getAgent(slug)) return [];
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
  try {
    if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
    if (!id) return { ok: false, error: "Campanha inválida." };
    await sql.unsafe(
      `update public.campaigns set active = false where id = $1 and agent_slug = $2`,
      [id, slug],
    );
    revalidatePath(`/${slug}/campaigns`);
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
  try {
    if (!getAgent(slug)) return fail("Agente desconhecido.");
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

    return await sendTemplateToLeads(
      slug,
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
  try {
    if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
    if (!getMetaConfig(slug))
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
    revalidatePath(`/${slug}/disparos`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao programar o disparo." };
  }
}

export async function listScheduledDispatches(
  slug: string,
): Promise<ScheduledDispatch[]> {
  try {
    if (!getAgent(slug)) return [];
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
  try {
    if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
    if (!id) return { ok: false, error: "Disparo inválido." };
    await sql.unsafe(
      `update public.scheduled_dispatches set status = 'canceled'
       where id = $1 and agent_slug = $2 and status = 'pending' and kind = 'selected'`,
      [id, slug],
    );
    revalidatePath(`/${slug}/disparos`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro ao cancelar o disparo." };
  }
}

export async function getAutoRecovery(slug: string): Promise<AutoRecovery> {
  try {
    if (!getAgent(slug)) return null;
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
  try {
    if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
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
    revalidatePath(`/${slug}/disparos`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro ao atualizar a auto-recuperação." };
  }
}

// ---- Follow-up automático (lembretes quando o lead para) ------------

export type FollowupStep = { delayMinutes: number; message: string };
export type FollowupConfig = { enabled: boolean; steps: FollowupStep[] };

export const DEFAULT_FOLLOWUP_STEPS: FollowupStep[] = [
  {
    delayMinutes: 30,
    message:
      "Oi! Vi que a gente parou no meio 😊 Ainda quer ver como o Agente24Horas atende seus clientes 24h no automático? É rapidinho.",
  },
  {
    delayMinutes: 120,
    message:
      "Passando pra saber se ficou alguma dúvida. Posso te mostrar o agente funcionando em 2 minutos, sem compromisso.",
  },
  {
    delayMinutes: 240,
    message:
      "Sei que o dia corre! Quando puder, me chama que eu te mostro como parar de perder cliente fora do horário.",
  },
  {
    delayMinutes: 720,
    message:
      "Ainda dá tempo de eu te mostrar na prática. Quer que eu reserve um horário rápido pra você ver o agente ao vivo?",
  },
  {
    delayMinutes: 1440,
    message:
      "Última mensagem pra não te encher 😊 Se ainda tiver interesse em automatizar seu WhatsApp, é só responder que eu retomo daqui.",
  },
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
  return steps
    .map((s) => {
      const o = (s ?? {}) as { delayMinutes?: unknown; message?: unknown };
      const delayMinutes = Math.max(1, Math.round(Number(o.delayMinutes) || 0));
      const message = typeof o.message === "string" ? o.message.trim() : "";
      return { delayMinutes, message };
    })
    .filter((s) => s.delayMinutes > 0 && s.message.length > 0)
    .sort((a, b) => a.delayMinutes - b.delayMinutes);
}

export async function getFollowupConfig(
  slug: string,
): Promise<FollowupConfig> {
  const fallback: FollowupConfig = {
    enabled: false,
    steps: DEFAULT_FOLLOWUP_STEPS,
  };
  try {
    if (!getAgent(slug)) return fallback;
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
  try {
    if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
    if (!getMetaConfig(slug))
      return { ok: false, error: "Agente sem número de WhatsApp oficial." };
    const steps = sanitizeSteps(input.steps);
    if (input.enabled && steps.length === 0)
      return {
        ok: false,
        error: "Adicione ao menos um passo com tempo e mensagem.",
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
    revalidatePath(`/${slug}/disparos`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro ao salvar o follow-up." };
  }
}
