import "server-only";
import { sql } from "./db";
import { safeSchema, getAgent } from "./agents";
import { getLeadSource, getMetaConfig } from "./meta-config";
import { sendTemplateToLeads } from "./actions";
import { sendWhatsappText } from "./clients/meta-whatsapp";

// Máximo de envios por dispatch em cada execução do cron (evita timeout).
const BATCH = 25;

type SchedRow = {
  id: string;
  agent_slug: string;
  campaign_id: string | null;
  template_name: string | null;
  template_lang: string | null;
  template_vars: unknown;
  target_phones: unknown;
};

function toStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function convMatch(schema: string): string {
  return `exists (
    select 1 from "${schema}".conversations c
    where l.phone_norm is not null and l.phone_norm <> '' and (
      regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g') = l.phone_norm
      or (length(l.phone_norm) >= 8
          and right(regexp_replace(coalesce(c.chat_id, ''), '\\D', '', 'g'), 8)
              = right(l.phone_norm, 8))
    )
  )`;
}

async function markResult(id: string, status: string | null, result: string) {
  try {
    if (status) {
      await sql.unsafe(
        `update public.scheduled_dispatches
         set status = $2, ran_at = now(), result = $3 where id = $1`,
        [id, status, result],
      );
    } else {
      await sql.unsafe(
        `update public.scheduled_dispatches
         set ran_at = now(), result = $2 where id = $1`,
        [id, result],
      );
    }
  } catch {
    // best-effort
  }
}

async function alreadySent(agent: string, phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const rows = await sql.unsafe<{ phone_norm: string | null }[]>(
    `select distinct phone_norm from public.outreach_sent
     where agent_slug = $1 and phone_norm = any($2::text[])`,
    [agent, phones],
  );
  return new Set(rows.map((r) => String(r.phone_norm ?? "")));
}

async function nameMap(
  pageId: string,
  phones: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (phones.length === 0) return map;
  try {
    const rows = await sql.unsafe<
      { phone_norm: string | null; full_name: string | null }[]
    >(
      `select phone_norm, full_name from public.meta_leads
       where page_id = $1 and phone_norm = any($2::text[])`,
      [pageId, phones],
    );
    for (const r of rows) {
      if (r.phone_norm) map.set(String(r.phone_norm), r.full_name ?? "");
    }
  } catch {
    // best-effort
  }
  return map;
}

async function processSelected(d: SchedRow): Promise<number> {
  const agent = d.agent_slug;
  const templateName = d.template_name ?? "";
  if (!templateName) {
    await markResult(d.id, "error", "Sem template.");
    return 0;
  }
  const phones = toStrArray(d.target_phones);
  const sent = await alreadySent(agent, phones);
  const remaining = phones.filter((p) => !sent.has(p));

  if (remaining.length === 0) {
    await markResult(d.id, "done", "Nada a enviar (já disparado).");
    return 0;
  }

  const batch = remaining.slice(0, BATCH);
  const src = getLeadSource(agent);
  const names =
    src.leadSource === "form" ? await nameMap(src.pageId, batch) : new Map();
  const targets = batch.map((p) => ({ phone: p, name: names.get(p) ?? "" }));
  const vars = toStrArray(d.template_vars);

  const res = await sendTemplateToLeads(
    agent,
    targets,
    templateName,
    d.template_lang ?? "pt_BR",
    vars,
    1 + vars.length,
  );

  const done = remaining.length <= BATCH;
  await markResult(
    d.id,
    done ? "done" : null,
    `${res.enviados} enviados${res.falhas ? `, ${res.falhas} falhas` : ""}${
      done ? "" : " (continua na próxima execução)"
    }`,
  );
  return res.enviados;
}

async function processAuto(d: SchedRow): Promise<number> {
  const agent = d.agent_slug;
  const src = getLeadSource(agent);
  if (src.leadSource !== "form") {
    await markResult(d.id, null, "Auto: fonte não é formulário.");
    return 0;
  }
  const schema = safeSchema(agent);
  const pageId = src.pageId;

  const templateName = d.template_name ?? "";
  if (!templateName) {
    await markResult(d.id, null, "Auto: sem campanha/template.");
    return 0;
  }
  const vars = toStrArray(d.template_vars);

  // Leads "Aguardando" (não conversaram) do agente, ainda não prospectados.
  const leads = await sql.unsafe<
    { phone_norm: string | null; full_name: string | null }[]
  >(
    `select l.phone_norm, l.full_name
     from public.meta_leads l
     where l.page_id = $1 and l.phone_norm is not null and l.phone_norm <> ''
       and not ${convMatch(schema)}
       and not exists (
         select 1 from public.outreach_sent os
         where os.agent_slug = $2 and os.phone_norm = l.phone_norm
       )
     order by l.created_time desc nulls last
     limit ${BATCH}`,
    [pageId, agent],
  );

  if (leads.length === 0) {
    await markResult(d.id, null, "Auto: nenhum lead aguardando.");
    return 0;
  }

  const targets = leads
    .filter((l) => l.phone_norm)
    .map((l) => ({ phone: String(l.phone_norm), name: l.full_name ?? "" }));

  const res = await sendTemplateToLeads(
    agent,
    targets,
    templateName,
    d.template_lang ?? "pt_BR",
    vars,
    1 + vars.length,
  );
  await markResult(d.id, null, `Auto: ${res.enviados} enviados.`);
  return res.enviados;
}

// ---- Follow-up automático (lembretes em texto livre, janela 72h) ----

const FOLLOWUP_CAP = 40;

type FollowupStep = { delayMinutes: number; message: string };

function parseSteps(v: unknown): FollowupStep[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s) => {
      const o = (s ?? {}) as { delayMinutes?: unknown; message?: unknown };
      return {
        delayMinutes: Math.round(Number(o.delayMinutes) || 0),
        message: typeof o.message === "string" ? o.message : "",
      };
    })
    .filter((s) => s.delayMinutes > 0 && s.message.trim().length > 0)
    .sort((a, b) => a.delayMinutes - b.delayMinutes);
}

async function processFollowups(): Promise<number> {
  let sent = 0;
  let configs: { agent_slug: string; steps: unknown }[] = [];
  try {
    configs = await sql.unsafe<{ agent_slug: string; steps: unknown }[]>(
      `select agent_slug, steps from public.followup_config where enabled = true`,
    );
  } catch {
    return 0; // tabela ainda não existe
  }

  for (const cfg of configs) {
    const agent = cfg.agent_slug;
    if (!getAgent(agent)) continue;
    const meta = getMetaConfig(agent);
    if (!meta) continue;
    const steps = parseSteps(cfg.steps);
    if (steps.length === 0) continue;

    let schema: string;
    try {
      schema = safeSchema(agent);
    } catch {
      continue;
    }

    // Conversas whatsapp cuja última msg do LEAD (T) está na janela de 72h e
    // já passou do menor delay configurado.
    let cands: { chat_id: string | null; last_user_ts: string | null }[] = [];
    try {
      cands = await sql.unsafe<
        { chat_id: string | null; last_user_ts: string | null }[]
      >(
        `select c.chat_id, mm.last_user_ts
         from "${schema}".conversations c
         join lateral (
           select max(m.ts) filter (where m.role = 'user') as last_user_ts
           from "${schema}".messages m where m.session_id = c.session_id
         ) mm on true
         where coalesce(c.channel, '') not ilike '%mail%'
           and c.chat_id is not null and c.chat_id <> ''
           and mm.last_user_ts is not null
           and mm.last_user_ts >= now() - interval '72 hours'
           and mm.last_user_ts <= now() - ($1 || ' minutes')::interval
         order by mm.last_user_ts desc
         limit ${FOLLOWUP_CAP}`,
        [String(steps[0].delayMinutes)],
      );
    } catch {
      continue;
    }

    for (const cand of cands) {
      if (sent >= FOLLOWUP_CAP) break;
      const chatId = String(cand.chat_id ?? "").replace(/\D/g, "");
      const T = cand.last_user_ts;
      if (!chatId || !T) continue;

      const elapsedMin = (Date.now() - new Date(T).getTime()) / 60000;
      const due = steps
        .map((s, i) => ({ ...s, index: i }))
        .filter((s) => s.delayMinutes <= elapsedMin);
      if (due.length === 0) continue;

      // step_index já enviados para esse T (mesma janela de silêncio)
      let sentIdx = new Set<number>();
      try {
        const rows = await sql.unsafe<{ step_index: number }[]>(
          `select step_index from public.followup_sent
           where agent_slug = $1 and chat_id = $2 and based_on_ts = $3`,
          [agent, chatId, T],
        );
        sentIdx = new Set(rows.map((r) => Number(r.step_index)));
      } catch {
        // segue: o índice único abaixo evita duplicar de qualquer forma
      }

      const next = due.find((s) => !sentIdx.has(s.index));
      if (!next) continue;

      // Reivindica o passo (dedupe pelo índice único). Se conflitar, pula.
      const id = `${agent}:${chatId}:${next.index}:${new Date(T).getTime()}:${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      let claimed = false;
      try {
        const ins = await sql.unsafe<{ id: string }[]>(
          `insert into public.followup_sent
             (id, agent_slug, chat_id, step_index, based_on_ts, sent_at, status)
           values ($1, $2, $3, $4, $5, now(), 'pending')
           on conflict (agent_slug, chat_id, step_index, based_on_ts) do nothing
           returning id`,
          [id, agent, chatId, next.index, T],
        );
        claimed = ins.length > 0;
      } catch {
        claimed = false;
      }
      if (!claimed) continue;

      const res = await sendWhatsappText(chatId, next.message, meta.phoneNumberId);
      const status = res.ok
        ? "sent"
        : res.outsideWindow
          ? "window_closed"
          : "error";
      try {
        await sql.unsafe(
          `update public.followup_sent set status = $2, sent_at = now() where id = $1`,
          [id, status],
        );
      } catch {
        // best-effort
      }
      if (res.ok) sent++;
    }
  }
  return sent;
}

export async function runDispatches(): Promise<{
  ok: boolean;
  selected: number;
  auto: number;
  followups: number;
}> {
  let selected = 0;
  let auto = 0;
  let followups = 0;

  // 'selected' vencidos (scheduled_at <= now)
  try {
    const rows = await sql.unsafe<SchedRow[]>(
      `select id, agent_slug, campaign_id, template_name, template_lang,
              template_vars, target_phones
       from public.scheduled_dispatches
       where kind = 'selected' and status = 'pending'
         and scheduled_at is not null and scheduled_at <= now()
       order by scheduled_at asc
       limit 10`,
    );
    for (const d of rows) {
      try {
        selected += await processSelected(d);
      } catch {
        await markResult(d.id, "error", "Falha inesperada no disparo.");
      }
    }
  } catch {
    // tabela ausente ou erro: ignora
  }

  // 'auto_aguardando' ligados
  try {
    const autos = await sql.unsafe<SchedRow[]>(
      `select id, agent_slug, campaign_id, template_name, template_lang,
              template_vars, target_phones
       from public.scheduled_dispatches
       where kind = 'auto_aguardando' and enabled = true
       limit 10`,
    );
    for (const d of autos) {
      try {
        auto += await processAuto(d);
      } catch {
        await markResult(d.id, null, "Auto: falha inesperada.");
      }
    }
  } catch {
    // ignora
  }

  // Follow-up automático (lembretes de quem parou de responder)
  try {
    followups = await processFollowups();
  } catch {
    // ignora
  }

  return { ok: true, selected, auto, followups };
}
