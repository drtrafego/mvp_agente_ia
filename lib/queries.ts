import "server-only";
import { sql } from "./db";
import { AGENTS, safeSchema } from "./agents";

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
};

/**
 * Lê os leads de formulário (public.meta_leads, já escopada por cliente no
 * backend) e cruza com as conversas do agente por telefone (dígitos exatos ou
 * sufixo dos últimos 8) para marcar quem já iniciou conversa no WhatsApp.
 * Best-effort: qualquer erro retorna [].
 */
export async function getFormLeads(slug: string): Promise<FormLead[]> {
  const schema = safeSchema(slug);
  try {
    const rows = await sql.unsafe<
      (Omit<FormLead, "conversou" | "session_id"> & {
        conv_session_id: string | null;
      })[]
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
    return rows.map(({ conv_session_id, ...rest }) => ({
      ...rest,
      conversou: conv_session_id != null,
      session_id: conv_session_id,
    }));
  } catch {
    return [];
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
