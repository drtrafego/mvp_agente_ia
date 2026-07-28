"use server";

// Ações do kanban (reusadas pelos componentes portados do crm-unico), agora
// contra o banco do PAINEL. Aqui "orgId" é o SLUG do agente: cada agente tem
// suas tabelas no próprio schema ("<schema>".crm_columns / crm_leads), isolado.
// Toda ação passa pelo gate de acesso do agente.

import { sql } from "@/lib/db";
import { safeSchema } from "@/lib/agents";
import { assertAgentAccess } from "@/lib/access";

async function sch(orgId: string): Promise<string> {
  await assertAgentAccess(orgId);
  return safeSchema(orgId);
}

export async function updateLeadStatus(
  id: string,
  newColumnId: string,
  newPosition: number,
  orgId: string,
) {
  const s = await sch(orgId);
  await sql.unsafe(
    `update "${s}".crm_leads
        set column_id = $1, position = $2,
            first_contact_at = coalesce(first_contact_at, now())
      where id = $3`,
    [newColumnId, newPosition, id],
  );
}

export async function updateColumnOrder(orderedIds: string[], orgId: string) {
  const s = await sch(orgId);
  for (let i = 0; i < orderedIds.length; i++) {
    await sql.unsafe(`update "${s}".crm_columns set "order" = $1 where id = $2`, [
      i,
      orderedIds[i],
    ]);
  }
  const cols = await sql.unsafe(
    `select id, title, "order", color from "${s}".crm_columns order by "order" asc`,
  );
  return { success: true, columns: cols };
}

export async function createColumn(title: string, orgId: string) {
  const s = await sch(orgId);
  const clean = (title || "").trim();
  if (!clean) throw new Error("Título da coluna vazio");
  await sql.unsafe(
    `insert into "${s}".crm_columns (title, "order")
     values ($1, (select coalesce(max("order") + 1, 0) from "${s}".crm_columns))`,
    [clean],
  );
}

export async function updateColumn(id: string, title: string, orgId: string) {
  const s = await sch(orgId);
  const clean = (title || "").trim();
  if (!clean) throw new Error("Título da coluna vazio");
  await sql.unsafe(`update "${s}".crm_columns set title = $1 where id = $2`, [
    clean,
    id,
  ]);
}

export async function deleteColumn(id: string, orgId: string) {
  const s = await sch(orgId);
  const [fallback] = await sql.unsafe<{ id: string }[]>(
    `select id from "${s}".crm_columns where id <> $1 order by "order" asc limit 1`,
    [id],
  );
  if (fallback?.id) {
    await sql.unsafe(
      `update "${s}".crm_leads set column_id = $1 where column_id = $2`,
      [fallback.id, id],
    );
  }
  await sql.unsafe(`delete from "${s}".crm_columns where id = $1`, [id]);
}

export async function deleteLead(id: string, orgId: string) {
  const s = await sch(orgId);
  await sql.unsafe(`delete from "${s}".crm_leads where id = $1`, [id]);
}

export async function createLead(formData: FormData, orgId: string) {
  const s = await sch(orgId);
  const g = (k: string) => {
    const v = formData.get(k);
    const str = typeof v === "string" ? v.trim() : "";
    return str || null;
  };
  const name = g("name") || "Sem nome";
  const valueRaw = g("value");
  const value = valueRaw ? valueRaw.replace(/[^\d.,-]/g, "").replace(",", ".") : null;
  const [col] = await sql.unsafe<{ id: string }[]>(
    `select id from "${s}".crm_columns order by "order" asc limit 1`,
  );
  if (!col?.id) throw new Error("Nenhuma coluna no quadro");
  await sql.unsafe(
    `insert into "${s}".crm_leads
       (column_id, name, company, email, phone, notes, value, campaign_source, position, created_via)
     values ($1,$2,$3,$4,$5,$6,$7,$8,0,'manual_panel')`,
    [col.id, name, g("company"), g("email"), g("whatsapp"), g("notes"), value, g("campaignSource")],
  );
}

// Mapa campo-do-form -> coluna do banco (whatsapp é o telefone).
const FIELD_MAP: Record<string, string> = {
  name: "name",
  whatsapp: "phone",
  email: "email",
  company: "company",
  notes: "notes",
  value: "value",
  campaignSource: "campaign_source",
  followUpDate: "follow_up_date",
  followUpNote: "follow_up_note",
};

export async function updateLeadContent(
  id: string,
  data: Record<string, unknown>,
  orgId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const s = await sch(orgId);
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  let n = 1;
  for (const [k, col] of Object.entries(FIELD_MAP)) {
    if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
    const raw = data[k];
    let v: string | null = raw == null ? null : String(raw);
    if (col === "value") {
      const cleaned = (v ?? "").replace(/[^\d.,-]/g, "").replace(",", ".");
      v = cleaned ? cleaned : null;
    } else if (typeof v === "string") {
      v = v.trim() || null;
    }
    if (col === "name" && !v) v = "Sem nome";
    sets.push(`${col} = $${n++}`);
    vals.push(v);
  }
  if (!sets.length) return { ok: true };
  vals.push(id);
  await sql.unsafe(
    `update "${s}".crm_leads set ${sets.join(", ")} where id = $${n}`,
    vals,
  );
  return { ok: true };
}

// Histórico do lead: ainda não há tabela de histórico no painel; devolve vazio
// (o modal mostra "sem histórico"). Assinatura mantida p/ compatibilidade.
export async function getLeadHistory(_leadId: string, _orgId: string) {
  return [] as {
    id: string;
    action: string;
    details: string | null;
    createdAt: string | Date;
    fromColumn: string | null;
    toColumn: string | null;
    userName: string | null;
    userImage: string | null;
  }[];
}
