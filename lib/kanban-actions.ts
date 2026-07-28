"use server";

import { sql } from "./db";
import { safeSchema } from "./agents";
import { assertAgentAccess } from "./access";

// Todas as acoes do Kanban passam pelo gate de acesso do agente (assertAgentAccess)
// e usam o SCHEMA do proprio agente. Valores do usuario entram SEMPRE como
// parametro ($1, $2...), nunca interpolados, para nao abrir injecao.

async function schemaFor(slug: string): Promise<string> {
  await assertAgentAccess(slug); // 404 se nao tiver acesso a este agente
  return safeSchema(slug);
}

/** Move um card para outra coluna e posicao (arrastar-soltar). */
export async function moveLead(
  slug: string,
  leadId: string,
  toColumnId: string,
  newPosition: number,
): Promise<{ ok: true }> {
  const schema = await schemaFor(slug);
  await sql.unsafe(
    `update "${schema}".crm_leads
        set column_id = $1,
            position = $2,
            first_contact_at = coalesce(first_contact_at, now())
      where id = $3`,
    [toColumnId, newPosition, leadId],
  );
  return { ok: true };
}

/** Reordena as colunas conforme a lista de ids. */
export async function reorderColumns(
  slug: string,
  orderedIds: string[],
): Promise<{ ok: true }> {
  const schema = await schemaFor(slug);
  for (let i = 0; i < orderedIds.length; i++) {
    await sql.unsafe(
      `update "${schema}".crm_columns set "order" = $1 where id = $2`,
      [i, orderedIds[i]],
    );
  }
  return { ok: true };
}

/** Cria uma coluna nova no fim do quadro. */
export async function createColumn(
  slug: string,
  title: string,
): Promise<{ ok: true }> {
  const schema = await schemaFor(slug);
  const clean = title.trim();
  if (!clean) throw new Error("Título da coluna vazio");
  await sql.unsafe(
    `insert into "${schema}".crm_columns (title, "order")
     values ($1, (select coalesce(max("order") + 1, 0) from "${schema}".crm_columns))`,
    [clean],
  );
  return { ok: true };
}

/** Renomeia uma coluna. */
export async function renameColumn(
  slug: string,
  id: string,
  title: string,
): Promise<{ ok: true }> {
  const schema = await schemaFor(slug);
  const clean = title.trim();
  if (!clean) throw new Error("Título da coluna vazio");
  await sql.unsafe(
    `update "${schema}".crm_columns set title = $1 where id = $2`,
    [clean, id],
  );
  return { ok: true };
}

/** Apaga uma coluna. Os cards dela vão para a primeira coluna (nunca some lead). */
export async function deleteColumn(
  slug: string,
  id: string,
): Promise<{ ok: true }> {
  const schema = await schemaFor(slug);
  const [fallback] = await sql.unsafe<{ id: string }[]>(
    `select id from "${schema}".crm_columns where id <> $1 order by "order" asc limit 1`,
    [id],
  );
  if (fallback?.id) {
    await sql.unsafe(
      `update "${schema}".crm_leads set column_id = $1 where column_id = $2`,
      [fallback.id, id],
    );
  }
  await sql.unsafe(`delete from "${schema}".crm_columns where id = $1`, [id]);
  return { ok: true };
}

/** Cria um lead manualmente na coluna informada (ou na primeira). */
export async function createLead(
  slug: string,
  columnId: string | null,
  data: { name: string; phone?: string; email?: string; notes?: string },
): Promise<{ ok: true }> {
  const schema = await schemaFor(slug);
  const name = data.name.trim() || "Sem nome";
  const col =
    columnId ??
    (
      await sql.unsafe<{ id: string }[]>(
        `select id from "${schema}".crm_columns order by "order" asc limit 1`,
      )
    )[0]?.id;
  if (!col) throw new Error("Nenhuma coluna no quadro");
  await sql.unsafe(
    `insert into "${schema}".crm_leads (column_id, name, phone, email, notes, position, created_via)
     values ($1, $2, $3, $4, $5, 0, 'manual_panel')`,
    [col, name, data.phone ?? null, data.email ?? null, data.notes ?? null],
  );
  return { ok: true };
}

/** Edita os dados de um lead (nome, telefone, email, origem, observações). */
export async function updateLead(
  slug: string,
  id: string,
  data: {
    name: string;
    phone?: string;
    email?: string;
    campaignSource?: string;
    notes?: string;
  },
): Promise<{ ok: true }> {
  const schema = await schemaFor(slug);
  const name = data.name.trim() || "Sem nome";
  await sql.unsafe(
    `update "${schema}".crm_leads
        set name = $1, phone = $2, email = $3, campaign_source = $4, notes = $5
      where id = $6`,
    [
      name,
      data.phone?.trim() || null,
      data.email?.trim() || null,
      data.campaignSource?.trim() || null,
      data.notes?.trim() || null,
      id,
    ],
  );
  return { ok: true };
}

/** Apaga um lead. */
export async function deleteLead(
  slug: string,
  id: string,
): Promise<{ ok: true }> {
  const schema = await schemaFor(slug);
  await sql.unsafe(`delete from "${schema}".crm_leads where id = $1`, [id]);
  return { ok: true };
}
