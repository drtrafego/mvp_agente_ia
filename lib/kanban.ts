import { sql } from "./db";
import { safeSchema } from "./agents";

// CRM Kanban do agente. As tabelas vivem no SCHEMA do proprio agente
// ("<schema>".crm_columns / crm_leads), isoladas por cliente (nunca misturar).

export type KanbanColumn = {
  id: string;
  title: string;
  order: number;
  color: string | null;
};

export type KanbanLead = {
  id: string;
  columnId: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  campaignSource: string | null;
  position: number;
  createdVia: string | null;
  firstContactAt: string | null;
  createdAt: string;
};

export type KanbanBoard = {
  columns: KanbanColumn[];
  leads: KanbanLead[];
};

// Le o board inteiro do agente. Se o agente ainda nao tem as tabelas do CRM
// (schema sem crm_columns), devolve board vazio em vez de estourar.
export async function getBoard(slug: string): Promise<KanbanBoard> {
  const schema = await safeSchema(slug);
  try {
    const columns = await sql.unsafe<KanbanColumn[]>(
      `select id, title, "order", color
         from "${schema}".crm_columns
        order by "order" asc, title asc`,
    );
    const leads = await sql.unsafe<KanbanLead[]>(
      `select id,
              column_id      as "columnId",
              name,
              phone,
              email,
              notes,
              campaign_source as "campaignSource",
              position,
              created_via    as "createdVia",
              first_contact_at as "firstContactAt",
              created_at     as "createdAt"
         from "${schema}".crm_leads
        order by column_id, position asc, created_at desc`,
    );
    return { columns, leads };
  } catch {
    // Agente sem CRM provisionado ainda.
    return { columns: [], leads: [] };
  }
}

// Confere se o agente tem o CRM Kanban provisionado (tabela existe e ha colunas).
export async function hasKanban(slug: string): Promise<boolean> {
  const schema = await safeSchema(slug);
  try {
    const [row] = await sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from "${schema}".crm_columns`,
    );
    return (row?.n ?? 0) > 0;
  } catch {
    return false;
  }
}
