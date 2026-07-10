import "server-only";
import { sql } from "./db";
import { AGENTS, safeSchema } from "./agents";
import { getLeadSource } from "./meta-config";

export type PortalStat = {
  slug: string;
  conversations: number;
  messages: number;
  cost: number;
  lastActivity: string | null;
};

export async function getPortalStats(): Promise<Record<string, PortalStat>> {
  const entries = await Promise.all(
    AGENTS.map(async (a) => {
      const schema = safeSchema(a.slug);
      try {
        const [row] = await sql.unsafe<
          { conversations: number; cost: string | null; last: string | null }[]
        >(
          `select count(*)::int as conversations,
                  coalesce(sum(cost_usd), 0)::numeric as cost,
                  max(coalesce(ended_at, started_at)) as last
           from "${schema}".conversations`,
        );
        const [msg] = await sql.unsafe<{ messages: number }[]>(
          `select count(*)::int as messages from "${schema}".messages`,
        );
        return [
          a.slug,
          {
            slug: a.slug,
            conversations: row?.conversations ?? 0,
            messages: msg?.messages ?? 0,
            cost: Number(row?.cost ?? 0),
            lastActivity: row?.last ?? null,
          },
        ] as const;
      } catch {
        return [
          a.slug,
          { slug: a.slug, conversations: 0, messages: 0, cost: 0, lastActivity: null },
        ] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export type Overview = {
  conversations: number;
  messages: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  byDay: { day: string; conversations: number; cost: number }[];
  byChannel: { channel: string; value: number }[];
};

export async function getOverview(slug: string): Promise<Overview> {
  const schema = safeSchema(slug);

  const [kpis] = await sql.unsafe<
    {
      conversations: number;
      cost: string | null;
      input_tokens: string | null;
      output_tokens: string | null;
    }[]
  >(
    `select count(*)::int as conversations,
            coalesce(sum(cost_usd), 0)::numeric as cost,
            coalesce(sum(input_tokens), 0)::bigint as input_tokens,
            coalesce(sum(output_tokens), 0)::bigint as output_tokens
     from "${schema}".conversations`,
  );

  const [msg] = await sql.unsafe<{ messages: number }[]>(
    `select count(*)::int as messages from "${schema}".messages`,
  );

  const byDay = await sql.unsafe<
    { day: string; conversations: number; cost: string }[]
  >(
    `select to_char(date_trunc('day', started_at), 'YYYY-MM-DD') as day,
            count(*)::int as conversations,
            coalesce(sum(cost_usd), 0)::numeric as cost
     from "${schema}".conversations
     where started_at is not null
     group by 1 order by 1`,
  );

  const byChannel = await sql.unsafe<{ channel: string; value: number }[]>(
    `select coalesce(channel, 'unknown') as channel, count(*)::int as value
     from "${schema}".conversations
     group by 1 order by 2 desc`,
  );

  return {
    conversations: kpis?.conversations ?? 0,
    messages: msg?.messages ?? 0,
    cost: Number(kpis?.cost ?? 0),
    inputTokens: Number(kpis?.input_tokens ?? 0),
    outputTokens: Number(kpis?.output_tokens ?? 0),
    byDay: byDay.map((d) => ({
      day: d.day,
      conversations: d.conversations,
      cost: Number(d.cost),
    })),
    byChannel,
  };
}

export type ConversationRow = {
  session_id: string;
  chat_id: string | null;
  channel: string | null;
  title: string | null;
  started_at: string | null;
  ended_at: string | null;
  message_count: number | null;
  cost_usd: string | null;
};

export async function getConversations(slug: string): Promise<ConversationRow[]> {
  const schema = safeSchema(slug);
  return sql.unsafe<ConversationRow[]>(
    `select session_id, chat_id, channel, title, started_at, ended_at,
            message_count, cost_usd
     from "${schema}".conversations
     order by coalesce(started_at, ended_at) desc nulls last`,
  );
}

export type MessageRow = {
  id: string;
  role: string;
  content: string;
  ts: string | null;
};

export async function getMessages(
  slug: string,
  sessionId: string,
): Promise<MessageRow[]> {
  const schema = safeSchema(slug);
  return sql.unsafe<MessageRow[]>(
    `select id, role, content, ts
     from "${schema}".messages
     where session_id = $1
     order by ts asc nulls last`,
    [sessionId],
  );
}

export async function getConversation(
  slug: string,
  sessionId: string,
): Promise<ConversationRow | null> {
  const schema = safeSchema(slug);
  const [row] = await sql.unsafe<ConversationRow[]>(
    `select session_id, chat_id, channel, title, started_at, ended_at,
            message_count, cost_usd
     from "${schema}".conversations
     where session_id = $1 limit 1`,
    [sessionId],
  );
  return row ?? null;
}

// Conversas do bot com tag de origem + prospecção (Minerador) -----------

export type ConvOrigin = "Anúncio" | "Direto" | "Prospecção" | "Disparo";
export type ConvChannel = "whatsapp" | "email";
export type ConvFilter = "all" | "ativas24h" | "responderam";

export type BotConvRow = ConversationRow & { origin: ConvOrigin };

/**
 * Conversas do bot (Hermes) do canal pedido, com tag de origem:
 * "Anúncio" quando o telefone casa com um lead de meta_leads, senão "Direto".
 * whatsapp = tudo que não é e-mail; email = channel que contém "mail".
 * filter:
 *  - ativas24h: última mensagem do lead (role='user') <= 24h atrás.
 *  - responderam: lead com 2+ mensagens (engajou, respondeu o bot).
 */
export async function getBotConversations(
  slug: string,
  channel: ConvChannel,
  filter: ConvFilter = "all",
): Promise<BotConvRow[]> {
  const schema = safeSchema(slug);
  const conds: string[] = [
    channel === "email"
      ? "c.channel ilike '%mail%'"
      : "coalesce(c.channel, '') not ilike '%mail%'",
  ];
  if (filter === "ativas24h") {
    conds.push("mm.last_user_ts >= now() - interval '24 hours'");
  } else if (filter === "responderam") {
    conds.push("coalesce(mm.user_count, 0) >= 2");
  }
  try {
    const rows = await sql.unsafe<(ConversationRow & { origin: string })[]>(
      `select c.session_id, c.chat_id, c.channel, c.title, c.started_at,
              c.ended_at, c.message_count, c.cost_usd,
              case
                when exists (
                  select 1 from public.outreach_sent os
                  where os.agent_slug = $1 and os.status = 'sent'
                    and os.phone_norm is not null and os.phone_norm <> '' and (
                      regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g') = os.phone_norm
                      or (length(os.phone_norm) >= 8
                          and right(regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g'), 8)
                              = right(os.phone_norm, 8))
                    )
                ) then 'Disparo'
                when exists (
                  select 1 from public.meta_leads l
                  where l.phone_norm is not null and l.phone_norm <> '' and (
                    regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g') = l.phone_norm
                    or (length(l.phone_norm) >= 8
                        and right(regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g'), 8)
                            = right(l.phone_norm, 8))
                  )
                ) or exists (
                  select 1 from "${schema}".messages m
                  where m.session_id = c.session_id and m.role = 'user'
                    and (m.content ilike '%vim%anúncio%' or m.content ilike '%vim%anuncio%')
                ) then 'Anúncio'
                else 'Direto'
              end as origin
       from "${schema}".conversations c
       left join lateral (
         select max(m.ts) filter (where m.role = 'user') as last_user_ts,
                count(*) filter (where m.role = 'user') as user_count
         from "${schema}".messages m where m.session_id = c.session_id
       ) mm on true
       where ${conds.join(" and ")}
       order by coalesce(c.started_at, c.ended_at) desc nulls last`,
      [slug],
    );
    const norm = (o: string): ConvOrigin =>
      o === "Disparo" ? "Disparo" : o === "Anúncio" ? "Anúncio" : "Direto";
    return rows.map((r) => ({ ...r, origin: norm(r.origin) }));
  } catch {
    return [];
  }
}

export type OutreachConvo = {
  id: string;
  agent_slug: string;
  channel: string;
  source: string;
  lead_name: string | null;
  lead_handle: string | null;
  lead_company: string | null;
  status: string | null;
  last_at: string | null;
  msg_count: number | null;
};

export type OutreachMsg = {
  id: string;
  convo_id: string;
  direction: string;
  status: string | null;
  subject: string | null;
  body: string | null;
  sent_at: string | null;
};

const OUTREACH_COLS = `id, agent_slug, channel, source, lead_name, lead_handle,
                       lead_company, status, last_at, msg_count`;

export async function getOutreachConvos(
  slug: string,
  channel: ConvChannel,
  filter: ConvFilter = "all",
): Promise<OutreachConvo[]> {
  const extra =
    filter === "ativas24h"
      ? "and oc.last_at >= now() - interval '24 hours'"
      : filter === "responderam"
        ? `and exists (select 1 from public.outreach_msgs m
                       where m.convo_id = oc.id and m.direction = 'inbound')`
        : "";
  try {
    return await sql.unsafe<OutreachConvo[]>(
      `select ${OUTREACH_COLS} from public.outreach_convos oc
       where oc.agent_slug = $1 and oc.channel = $2 ${extra}
       order by oc.last_at desc nulls last`,
      [slug, channel],
    );
  } catch {
    return [];
  }
}

export async function getOutreachConvo(
  slug: string,
  id: string,
): Promise<OutreachConvo | null> {
  try {
    const [row] = await sql.unsafe<OutreachConvo[]>(
      `select ${OUTREACH_COLS} from public.outreach_convos
       where id = $1 and agent_slug = $2 limit 1`,
      [id, slug],
    );
    return row ?? null;
  } catch {
    return null;
  }
}

export async function getOutreachMessages(
  convoId: string,
): Promise<OutreachMsg[]> {
  try {
    return await sql.unsafe<OutreachMsg[]>(
      `select id, convo_id, direction, status, subject, body, sent_at
       from public.outreach_msgs
       where convo_id = $1
       order by sent_at asc nulls last`,
      [convoId],
    );
  } catch {
    return [];
  }
}

// Disparos (a gente enviou a 1ª msg via template) e a pessoa AINDA não
// respondeu — logo não tem conversa do bot. ---------------------------

export type DispatchConvo = {
  phone_norm: string;
  full_name: string | null;
  template_name: string | null;
  sent_at: string | null;
};

export type DispatchDetail = DispatchConvo & {
  body: string | null;
  vars: string[];
};

/**
 * Retorna os disparos (outreach_sent) de quem NÃO respondeu (sem conversa do
 * bot). Só WhatsApp e só filtro "all" (quem não respondeu não está ativo/24h
 * nem "respondeu"). Dedupe por phone_norm (mais recente). Nome via meta_leads
 * escopado por page quando a fonte é formulário (não vaza nome de outro agente).
 */
export async function getDispatchConvos(
  slug: string,
  channel: ConvChannel,
  filter: ConvFilter = "all",
): Promise<DispatchConvo[]> {
  if (channel !== "whatsapp" || filter !== "all") return [];
  const schema = safeSchema(slug);
  const src = getLeadSource(slug);
  const nameJoin =
    src.leadSource === "form"
      ? `left join lateral (
           select l.full_name from public.meta_leads l
           where l.page_id = $2 and l.phone_norm is not null and (
             l.phone_norm = os.phone_norm
             or (length(os.phone_norm) >= 8 and right(l.phone_norm, 8) = right(os.phone_norm, 8))
           )
           order by l.created_time desc nulls last limit 1
         ) lead on true`
      : "";
  const nameSelect = src.leadSource === "form" ? "lead.full_name" : "null::text full_name";
  const params: SqlParam[] =
    src.leadSource === "form" ? [slug, src.pageId] : [slug];
  try {
    return await sql.unsafe<DispatchConvo[]>(
      `select distinct on (os.phone_norm)
              os.phone_norm, ${nameSelect}, os.template_name, os.sent_at
       from public.outreach_sent os
       ${nameJoin}
       where os.agent_slug = $1 and os.status = 'sent'
         and os.phone_norm is not null and os.phone_norm <> ''
         and not exists (
           select 1 from "${schema}".conversations c
           where regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g') = os.phone_norm
              or (length(os.phone_norm) >= 8
                  and right(regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g'), 8)
                      = right(os.phone_norm, 8))
         )
       order by os.phone_norm, os.sent_at desc`,
      params,
    );
  } catch {
    return [];
  }
}

/** Detalhe de um disparo (para abrir): dados do envio + corpo reconstruível. */
export async function getDispatchConvo(
  slug: string,
  phoneNorm: string,
): Promise<DispatchDetail | null> {
  const src = getLeadSource(slug);
  try {
    const [os] = await sql.unsafe<
      { phone_norm: string; template_name: string | null; sent_at: string | null }[]
    >(
      `select phone_norm, template_name, sent_at from public.outreach_sent
       where agent_slug = $1 and phone_norm = $2 and status = 'sent'
       order by sent_at desc nulls last limit 1`,
      [slug, phoneNorm],
    );
    if (!os) return null;

    let full_name: string | null = null;
    if (src.leadSource === "form") {
      const [l] = await sql.unsafe<{ full_name: string | null }[]>(
        `select full_name from public.meta_leads
         where page_id = $1 and phone_norm is not null and (
           phone_norm = $2
           or (length($2) >= 8 and right(phone_norm, 8) = right($2, 8))
         )
         order by created_time desc nulls last limit 1`,
        [src.pageId, phoneNorm],
      );
      full_name = l?.full_name ?? null;
    }

    let body: string | null = null;
    let vars: string[] = [];
    if (os.template_name) {
      const [c] = await sql.unsafe<
        { template_body: string | null; template_vars: unknown }[]
      >(
        `select template_body, template_vars from public.campaigns
         where agent_slug = $1 and template_name = $2 and active = true
         order by created_at desc nulls last limit 1`,
        [slug, os.template_name],
      );
      if (c) {
        body = c.template_body ?? null;
        vars = Array.isArray(c.template_vars)
          ? (c.template_vars as unknown[]).map((v) => String(v))
          : [];
      }
    }

    return {
      phone_norm: os.phone_norm,
      full_name,
      template_name: os.template_name,
      sent_at: os.sent_at,
      body,
      vars,
    };
  } catch {
    return null;
  }
}

// Atribuição de lead (Meta Lead Ads) ----------------------------------

export type LeadField = { name: string; values: string[] };

export type MetaLead = {
  source: "form" | "ctwa";
  lead_id: string | null;
  created_time: string | null;
  page_name: string | null;
  form_name: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  platform: string | null;
  full_name: string | null;
  phone: string | null;
  phone_norm: string | null;
  email: string | null;
  field_data: LeadField[] | null;
  headline: string | null;
  body: string | null;
};

const LEAD_COLS = `lead_id, created_time, page_name, form_name, campaign_name,
                   adset_name, ad_name, platform, full_name, phone, phone_norm,
                   email, field_data`;

type CtwaRow = {
  phone_norm: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  headline: string | null;
  body: string | null;
  source_url: string | null;
  ts: string | null;
  source_id: string | null;
};

/**
 * Casa a conversa (chat_id + channel) com um lead do formulário Meta.
 * WhatsApp/telefone: match por dígitos (exato, senão sufixo dos últimos 8 —
 * cobre variação de DDI/9º dígito). E-mail: match por endereço.
 * Best-effort: qualquer erro (tabela ausente etc.) retorna null.
 */
export async function getLeadForConversation(
  conversation: Pick<ConversationRow, "chat_id" | "channel">,
): Promise<MetaLead | null> {
  const chatId = conversation.chat_id?.trim();
  if (!chatId) return null;

  const channel = (conversation.channel ?? "").toLowerCase();
  const isEmail =
    channel.includes("mail") || chatId.includes("@");

  try {
    if (isEmail) {
      const [row] = await sql.unsafe<Omit<MetaLead, "source" | "headline" | "body">[]>(
        `select ${LEAD_COLS} from public.meta_leads
         where lower(email) = lower($1)
         order by created_time desc nulls last limit 1`,
        [chatId],
      );
      return row ? { ...row, source: "form", headline: null, body: null } : null;
    }

    const digits = chatId.replace(/\D/g, "");
    if (!digits) return null;
    const suffix = digits.length >= 8 ? digits.slice(-8) : null;

    const [formRow] = await sql.unsafe<Omit<MetaLead, "source" | "headline" | "body">[]>(
      `select ${LEAD_COLS} from public.meta_leads
       where phone_norm = $1
         ${suffix ? "or right(phone_norm, 8) = $2" : ""}
       order by (phone_norm = $1) desc, created_time desc nulls last
       limit 1`,
      suffix ? [digits, suffix] : [digits],
    );
    if (formRow) return { ...formRow, source: "form", headline: null, body: null };

    // Fallback: anúncio Click-to-WhatsApp (sem formulário).
    return getCtwaLead(digits, suffix);
  } catch {
    return null;
  }
}

function ctwaTimestamp(ts: string | null): string | null {
  if (!ts) return null;
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  // epoch em segundos (10 dígitos) vs milissegundos (13 dígitos).
  const ms = n < 1e12 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

async function getCtwaLead(
  digits: string,
  suffix: string | null,
): Promise<MetaLead | null> {
  try {
    const [row] = await sql.unsafe<CtwaRow[]>(
      `select phone_norm, campaign_name, adset_name, ad_name, headline, body,
              source_url, ts, source_id
       from public.ctwa_referrals
       where phone_norm = $1
         ${suffix ? "or right(phone_norm, 8) = $2" : ""}
       order by (phone_norm = $1) desc, ts desc nulls last
       limit 1`,
      suffix ? [digits, suffix] : [digits],
    );
    if (!row) return null;
    return {
      source: "ctwa",
      lead_id: row.source_id,
      created_time: ctwaTimestamp(row.ts),
      page_name: null,
      form_name: null,
      campaign_name: row.campaign_name,
      adset_name: row.adset_name,
      ad_name: row.ad_name,
      platform: null,
      full_name: null,
      phone: row.phone_norm,
      phone_norm: row.phone_norm,
      email: null,
      field_data: null,
      headline: row.headline,
      body: row.body,
    };
  } catch {
    return null;
  }
}

// Leads de formulário (Meta Lead Ads) --------------------------------

export type FormLead = {
  lead_id: string | null;
  created_time: string | null;
  page_name: string | null;
  form_name: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  platform: string | null;
  full_name: string | null;
  phone: string | null;
  phone_norm: string | null;
  email: string | null;
  field_data: LeadField[] | null;
  conversou: boolean;
  session_id: string | null;
  templateEnviado: boolean;
  ultimoTemplate: string | null;
  enviadoEm: string | null;
};

/**
 * Lê os leads de formulário (public.meta_leads, já escopada por cliente no
 * backend) e cruza com as conversas do agente por telefone (dígitos exatos ou
 * sufixo dos últimos 8) para marcar quem já iniciou conversa no WhatsApp.
 * Também marca quem já recebeu disparo de template (public.outreach_sent).
 * Best-effort: qualquer erro retorna [].
 */
export async function getFormLeads(slug: string): Promise<FormLead[]> {
  const schema = safeSchema(slug);
  try {
    const rows = await sql.unsafe<
      (Omit<
        FormLead,
        | "conversou"
        | "session_id"
        | "templateEnviado"
        | "ultimoTemplate"
        | "enviadoEm"
      > & { conv_session_id: string | null })[]
    >(
      `select l.lead_id, l.created_time, l.page_name, l.form_name,
              l.campaign_name, l.adset_name, l.ad_name, l.platform,
              l.full_name, l.phone, l.phone_norm, l.email, l.field_data,
              conv.session_id as conv_session_id
       from public.meta_leads l
       left join lateral (
         select c.session_id
         from "${schema}".conversations c
         where l.phone_norm is not null and l.phone_norm <> '' and (
           regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g') = l.phone_norm
           or (
             length(l.phone_norm) >= 8
             and right(regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g'), 8)
                 = right(l.phone_norm, 8)
           )
         )
         order by coalesce(c.started_at, c.ended_at) desc nulls last
         limit 1
       ) conv on true
       order by l.created_time desc nulls last`,
    );

    const outreach = await getOutreachMap(slug);

    return rows.map(({ conv_session_id, ...rest }) => {
      const o = rest.phone_norm ? outreach[rest.phone_norm] : undefined;
      return {
        ...rest,
        conversou: conv_session_id != null,
        session_id: conv_session_id,
        templateEnviado: !!o,
        ultimoTemplate: o?.template ?? null,
        enviadoEm: o?.sentAt ?? null,
      };
    });
  } catch {
    return [];
  }
}

/** Mapa phone_norm → último template disparado (public.outreach_sent). */
async function getOutreachMap(
  slug: string,
): Promise<Record<string, { template: string | null; sentAt: string | null }>> {
  try {
    const rows = await sql.unsafe<
      { phone_norm: string | null; template_name: string | null; sent_at: string | null }[]
    >(
      `select distinct on (phone_norm) phone_norm, template_name, sent_at
       from public.outreach_sent
       where agent_slug = $1 and status = 'sent'
       order by phone_norm, sent_at desc nulls last`,
      [slug],
    );
    const map: Record<string, { template: string | null; sentAt: string | null }> = {};
    for (const r of rows) {
      if (r.phone_norm) map[r.phone_norm] = { template: r.template_name, sentAt: r.sent_at };
    }
    return map;
  } catch {
    return {};
  }
}

// Pipeline -------------------------------------------------------------

export const STAGES = ["Novo", "Em conversa", "Agendado", "Perdido"] as const;
export type Stage = (typeof STAGES)[number];

export function inferStage(title: string | null): Stage {
  const t = (title ?? "").toLowerCase();
  if (/(perd|cancel|desist|sem interesse|não tem interesse|nao tem interesse)/.test(t))
    return "Perdido";
  if (/(agend|marcad|reuni|diagn[óo]stic|videochamada|call|hor[áa]rio)/.test(t))
    return "Agendado";
  if (/(interesse|d[úu]vida|atendimento|resposta|e-?mail|convers|or[çc]amento|proposta|bem-vindo)/.test(t))
    return "Em conversa";
  return "Novo";
}

export type Lead = {
  session_id: string;
  chat_id: string | null;
  channel: string | null;
  title: string | null;
  started_at: string | null;
  message_count: number | null;
  cost_usd: string | null;
  stage: Stage;
};

export async function getLeads(slug: string): Promise<Record<Stage, Lead[]>> {
  const rows = await getConversations(slug);
  const board: Record<Stage, Lead[]> = {
    Novo: [],
    "Em conversa": [],
    Agendado: [],
    Perdido: [],
  };
  for (const r of rows) {
    const stage = inferStage(r.title);
    board[stage].push({
      session_id: r.session_id,
      chat_id: r.chat_id,
      channel: r.channel,
      title: r.title,
      started_at: r.started_at,
      message_count: r.message_count,
      cost_usd: r.cost_usd,
      stage,
    });
  }
  return board;
}

// Dashboard "Visão geral" (gestor de tráfego) -------------------------

export type Period = "today" | "7d" | "30d";

export type Delta = { current: number; previous: number };

export type DashboardSource = "form" | "outreach" | "none";

export type DashboardData = {
  period: Period;
  sourceKind: DashboardSource;
  labels: { leads: string; conversaram: string };
  leads: Delta;
  leadsToday: number;
  conversas: Delta;
  conversaram: Delta;
  engajaram: number;
  agendaram: number;
  conversasAtivas: number;
  custoUsd: Delta;
  timeline: { day: string; leads: number; conversas: number; cost: number }[];
  adRanking: {
    ad_name: string;
    campaign_name: string;
    leads: number;
    conversaram: number;
    taxa: number;
  }[];
  byPlatform: { platform: string; value: number }[];
  topCampaigns: { campaign: string; value: number }[];
  byChannel: { channel: string; value: number }[];
  outreachByChannel: { channel: string; value: number }[];
  bot: { avgFirstRespSec: number | null; avgMsgs: number };
  recent: {
    session_id: string;
    chat_id: string | null;
    channel: string | null;
    title: string | null;
    started_at: string | null;
    message_count: number | null;
    full_name: string | null;
  }[];
};

function periodRange(period: Period) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  let curStart: Date;
  let prevStart: Date;
  let prevEnd: Date;

  if (period === "today") {
    curStart = new Date(startOfToday);
    prevEnd = new Date(startOfToday);
    prevStart = new Date(startOfToday);
    prevStart.setDate(prevStart.getDate() - 1);
  } else {
    const days = period === "30d" ? 30 : 7;
    curStart = new Date(now.getTime() - days * 86400000);
    prevEnd = new Date(curStart);
    prevStart = new Date(now.getTime() - 2 * days * 86400000);
  }

  return {
    curStart: curStart.toISOString(),
    curEnd: now.toISOString(),
    prevStart: prevStart.toISOString(),
    prevEnd: prevEnd.toISOString(),
    todayStart: startOfToday.toISOString(),
  };
}

function daysBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const d = new Date(startIso);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(endIso);
  let guard = 0;
  while (d <= end && guard < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
    guard++;
  }
  return out;
}

/** Predicado SQL: lead (alias l) casa com alguma conversa do agente. */
function convMatch(schema: string, extra = ""): string {
  return `exists (
    select 1 from "${schema}".conversations c
    where l.phone_norm is not null and l.phone_norm <> '' and (
      regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g') = l.phone_norm
      or (length(l.phone_norm) >= 8
          and right(regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g'), 8)
              = right(l.phone_norm, 8))
    ) ${extra}
  )`;
}

type SqlParam = string | number | null;

async function scalar(query: string, params: SqlParam[]): Promise<number> {
  try {
    const [row] = await sql.unsafe<{ v: string | number | null }[]>(query, params);
    return Number(row?.v ?? 0);
  } catch {
    return 0;
  }
}

async function rowsSafe<T>(query: string, params: SqlParam[] = []): Promise<T[]> {
  try {
    return await sql.unsafe<T[]>(query, params);
  } catch {
    return [];
  }
}

type RecentRow = {
  session_id: string;
  chat_id: string | null;
  channel: string | null;
  title: string | null;
  started_at: string | null;
  message_count: number | null;
  full_name: string | null;
};

export async function getDashboard(
  slug: string,
  period: Period,
): Promise<DashboardData> {
  const schema = safeSchema(slug);
  const src = getLeadSource(slug);
  const { curStart, curEnd, prevStart, prevEnd, todayStart } =
    periodRange(period);

  // ---------- comum a todas as fontes (conversas do bot) ----------
  const convCount = (a: string, b: string) =>
    scalar(
      `select count(*)::int v from "${schema}".conversations
       where started_at >= $1 and started_at < $2`,
      [a, b],
    );

  const custo = (a: string, b: string) =>
    scalar(
      `select coalesce(sum(cost_usd), 0)::numeric v from "${schema}".conversations
       where started_at >= $1 and started_at < $2`,
      [a, b],
    );

  // Nomes de lead só entram no feed quando a fonte é formulário (escopado por
  // page_id). Em outras fontes NÃO cruzamos meta_leads (evita vazar nomes de
  // outro agente).
  const recentQuery =
    src.leadSource === "form"
      ? `select c.session_id, c.chat_id, c.channel, c.title, c.started_at,
                c.message_count, lead.full_name
         from "${schema}".conversations c
         left join lateral (
           select l.full_name from public.meta_leads l
           where l.page_id = $1 and l.phone_norm is not null and l.phone_norm <> '' and (
             regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g') = l.phone_norm
             or (length(l.phone_norm) >= 8
                 and right(regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g'), 8)
                     = right(l.phone_norm, 8))
           )
           order by l.created_time desc nulls last limit 1
         ) lead on true
         order by coalesce(c.started_at, c.ended_at) desc nulls last
         limit 8`
      : `select c.session_id, c.chat_id, c.channel, c.title, c.started_at,
                c.message_count, null::text full_name
         from "${schema}".conversations c
         order by coalesce(c.started_at, c.ended_at) desc nulls last
         limit 8`;
  const recentParams: SqlParam[] =
    src.leadSource === "form" ? [src.pageId] : [];

  const [convCur, convPrev, custoCur, custoPrev, conversasAtivas, convByDay, byChannel, recent] =
    await Promise.all([
      convCount(curStart, curEnd),
      convCount(prevStart, prevEnd),
      custo(curStart, curEnd),
      custo(prevStart, prevEnd),
      scalar(
        `select count(distinct session_id)::int v from "${schema}".messages
         where ts >= now() - interval '24 hours'`,
        [],
      ),
      rowsSafe<{ day: string; v: number; c: string }>(
        `select to_char(date_trunc('day', started_at), 'YYYY-MM-DD') day,
                count(*)::int v, coalesce(sum(cost_usd), 0)::numeric c
         from "${schema}".conversations where started_at >= $1 and started_at < $2 group by 1`,
        [curStart, curEnd],
      ),
      rowsSafe<{ channel: string; value: number }>(
        `select coalesce(channel, 'unknown') channel, count(*)::int value
         from "${schema}".conversations where started_at >= $1 and started_at < $2
         group by 1 order by 2 desc`,
        [curStart, curEnd],
      ),
      rowsSafe<RecentRow>(recentQuery, recentParams),
    ]);

  // ---------- métricas de fonte de leads ----------
  let leadsCur = 0;
  let leadsPrev = 0;
  let leadsToday = 0;
  let conversaramCur = 0;
  let conversaramPrev = 0;
  let engajaram = 0;
  let leadsByDay: { day: string; v: number }[] = [];
  let adRanking: {
    ad_name: string;
    campaign_name: string;
    leads: number;
    conversaram: number;
  }[] = [];
  let byPlatform: { platform: string; value: number }[] = [];
  let topCampaigns: { campaign: string; value: number }[] = [];
  let outreachByChannel: { channel: string; value: number }[] = [];
  let labels = { leads: "Leads", conversaram: "Conversaram" };

  if (src.leadSource === "form") {
    const pid = src.pageId;
    const leadsCount = (a: string, b: string) =>
      scalar(
        `select count(*)::int v from public.meta_leads
         where page_id = $1 and created_time >= $2 and created_time < $3`,
        [pid, a, b],
      );
    const leadsConversaram = (a: string, b: string) =>
      scalar(
        `select count(*)::int v from public.meta_leads l
         where l.page_id = $1 and l.created_time >= $2 and l.created_time < $3
           and ${convMatch(schema)}`,
        [pid, a, b],
      );

    [
      leadsCur,
      leadsPrev,
      leadsToday,
      conversaramCur,
      conversaramPrev,
      engajaram,
      leadsByDay,
      adRanking,
      byPlatform,
      topCampaigns,
    ] = await Promise.all([
      leadsCount(curStart, curEnd),
      leadsCount(prevStart, prevEnd),
      scalar(
        `select count(*)::int v from public.meta_leads
         where page_id = $1 and created_time >= $2`,
        [pid, todayStart],
      ),
      leadsConversaram(curStart, curEnd),
      leadsConversaram(prevStart, prevEnd),
      scalar(
        `select count(*)::int v from public.meta_leads l
         where l.page_id = $1 and l.created_time >= $2 and l.created_time < $3
           and ${convMatch(schema, "and coalesce(c.message_count, 0) >= 4")}`,
        [pid, curStart, curEnd],
      ),
      rowsSafe<{ day: string; v: number }>(
        `select to_char(date_trunc('day', created_time), 'YYYY-MM-DD') day, count(*)::int v
         from public.meta_leads
         where page_id = $1 and created_time >= $2 and created_time < $3 group by 1`,
        [pid, curStart, curEnd],
      ),
      rowsSafe<{
        ad_name: string;
        campaign_name: string;
        leads: number;
        conversaram: number;
      }>(
        `select coalesce(nullif(l.ad_name, ''), '(sem anúncio)') ad_name,
                coalesce(nullif(l.campaign_name, ''), '—') campaign_name,
                count(*)::int leads,
                count(*) filter (where ${convMatch(schema)})::int conversaram
         from public.meta_leads l
         where l.page_id = $1 and l.created_time >= $2 and l.created_time < $3
         group by 1, 2
         order by (count(*) filter (where ${convMatch(schema)})::float
                   / nullif(count(*), 0)) desc nulls last, leads desc
         limit 15`,
        [pid, curStart, curEnd],
      ),
      rowsSafe<{ platform: string; value: number }>(
        `select coalesce(nullif(platform, ''), 'unknown') platform, count(*)::int value
         from public.meta_leads where page_id = $1 and created_time >= $2 and created_time < $3
         group by 1 order by 2 desc`,
        [pid, curStart, curEnd],
      ),
      rowsSafe<{ campaign: string; value: number }>(
        `select coalesce(nullif(campaign_name, ''), '—') campaign, count(*)::int value
         from public.meta_leads where page_id = $1 and created_time >= $2 and created_time < $3
         group by 1 order by 2 desc limit 6`,
        [pid, curStart, curEnd],
      ),
    ]);
  } else if (src.leadSource === "outreach") {
    labels = { leads: "Disparos", conversaram: "Responderam" };
    const disparos = (a: string, b: string) =>
      scalar(
        `select count(*)::int v from public.outreach_convos
         where agent_slug = $1 and last_at >= $2 and last_at < $3`,
        [slug, a, b],
      );
    const responderam = (a: string, b: string) =>
      scalar(
        `select count(*)::int v from public.outreach_convos oc
         where oc.agent_slug = $1 and oc.last_at >= $2 and oc.last_at < $3
           and exists (select 1 from public.outreach_msgs m
                       where m.convo_id = oc.id and m.direction = 'inbound')`,
        [slug, a, b],
      );

    [leadsCur, leadsPrev, leadsToday, conversaramCur, conversaramPrev, leadsByDay, outreachByChannel] =
      await Promise.all([
        disparos(curStart, curEnd),
        disparos(prevStart, prevEnd),
        scalar(
          `select count(*)::int v from public.outreach_convos
           where agent_slug = $1 and last_at >= $2`,
          [slug, todayStart],
        ),
        responderam(curStart, curEnd),
        responderam(prevStart, prevEnd),
        rowsSafe<{ day: string; v: number }>(
          `select to_char(date_trunc('day', last_at), 'YYYY-MM-DD') day, count(*)::int v
           from public.outreach_convos
           where agent_slug = $1 and last_at >= $2 and last_at < $3 group by 1`,
          [slug, curStart, curEnd],
        ),
        rowsSafe<{ channel: string; value: number }>(
          `select coalesce(channel, 'unknown') channel, count(*)::int value
           from public.outreach_convos
           where agent_slug = $1 and last_at >= $2 and last_at < $3
           group by 1 order by 2 desc`,
          [slug, curStart, curEnd],
        ),
      ]);
  }
  // 'none': tudo zerado (leads/funil ficam sem dados).

  const [avgFirstRespSec, avgMsgs] = await Promise.all([
    (async () => {
      const v = await scalar(
        `select avg(extract(epoch from (a.fa - u.fu)))::float v from (
           select session_id, min(ts) fu from "${schema}".messages where role = 'user' group by session_id
         ) u
         join (
           select session_id, min(ts) fa from "${schema}".messages where role = 'assistant' group by session_id
         ) a on a.session_id = u.session_id
         where a.fa > u.fu`,
        [],
      );
      return v > 0 ? v : null;
    })(),
    scalar(
      `select coalesce(avg(message_count), 0)::float v from "${schema}".conversations
       where started_at >= $1 and started_at < $2 and message_count is not null`,
      [curStart, curEnd],
    ),
  ]);

  const leadsMap = new Map(leadsByDay.map((r) => [r.day, r.v]));
  const convMap = new Map(convByDay.map((r) => [r.day, r.v]));
  const costMap = new Map(convByDay.map((r) => [r.day, Number(r.c)]));
  const timeline = daysBetween(curStart, curEnd).map((day) => ({
    day,
    leads: leadsMap.get(day) ?? 0,
    conversas: convMap.get(day) ?? 0,
    cost: costMap.get(day) ?? 0,
  }));

  return {
    period,
    sourceKind: src.leadSource,
    labels,
    leads: { current: leadsCur, previous: leadsPrev },
    leadsToday,
    conversas: { current: convCur, previous: convPrev },
    conversaram: { current: conversaramCur, previous: conversaramPrev },
    engajaram,
    agendaram: 0,
    conversasAtivas,
    custoUsd: { current: custoCur, previous: custoPrev },
    timeline,
    adRanking: adRanking.map((r) => ({
      ...r,
      taxa: r.leads > 0 ? (r.conversaram / r.leads) * 100 : 0,
    })),
    byPlatform,
    topCampaigns,
    byChannel,
    outreachByChannel,
    bot: { avgFirstRespSec, avgMsgs },
    recent,
  };
}
