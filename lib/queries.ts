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
