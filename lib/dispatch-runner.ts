import "server-only";
import { sql } from "./db";
import { getAgent } from "./agents";
import { assertIdent } from "./identifier";
import { getLeadSource } from "./meta-config";
import { sendTemplateToLeadsInternal } from "./outreach";

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
  // O cron nao tem sessao de usuario: resolve o agente pelo catalogo e usa o
  // caminho interno de disparo, que nao exige acesso humano.
  const record = await getAgent(agent);
  if (!record) {
    await markResult(d.id, "error", "Agente fora do catálogo.");
    return 0;
  }
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
  const src = getLeadSource(record);
  const names =
    src.leadSource === "form" ? await nameMap(src.pageId, batch) : new Map();
  const targets = batch.map((p) => ({ phone: p, name: names.get(p) ?? "" }));
  const vars = toStrArray(d.template_vars);

  const res = await sendTemplateToLeadsInternal(
    record,
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
  const record = await getAgent(agent);
  const src = getLeadSource(record);
  if (src.leadSource !== "form") {
    await markResult(d.id, null, "Auto: fonte não é formulário.");
    return 0;
  }
  if (!record) {
    await markResult(d.id, null, "Auto: agente fora do catálogo.");
    return 0;
  }
  const schema = assertIdent(record.schema);
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

  const res = await sendTemplateToLeadsInternal(
    record,
    targets,
    templateName,
    d.template_lang ?? "pt_BR",
    vars,
    1 + vars.length,
  );
  await markResult(d.id, null, `Auto: ${res.enviados} enviados.`);
  return res.enviados;
}

export async function runDispatches(): Promise<{
  ok: boolean;
  selected: number;
  auto: number;
}> {
  let selected = 0;
  let auto = 0;

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

  return { ok: true, selected, auto };
}
