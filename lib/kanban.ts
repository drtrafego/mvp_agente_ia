import { sql } from "./db";
import { safeSchema } from "./agents";
import type { Lead, Column } from "@/server/db/schema";

// CRM Kanban do agente. As tabelas vivem no SCHEMA do próprio agente
// ("<schema>".crm_columns / crm_leads), isoladas por cliente (nunca misturar).
// Devolve os dados no formato que os componentes (portados do crm-unico) leem.

export type { Lead, Column } from "@/server/db/schema";

export type KanbanBoard = {
  columns: Column[];
  leads: Lead[];
};

export async function getBoard(slug: string): Promise<KanbanBoard> {
  const schema = await safeSchema(slug);
  try {
    const cols = await sql.unsafe<
      { id: string; title: string; order: number; color: string | null }[]
    >(
      `select id, title, "order", color
         from "${schema}".crm_columns
        order by "order" asc, title asc`,
    );
    const rows = await sql.unsafe<
      {
        id: string;
        name: string;
        company: string | null;
        email: string | null;
        phone: string | null;
        notes: string | null;
        campaign_source: string | null;
        value: string | null;
        column_id: string | null;
        position: number;
        status: string | null;
        created_via: string | null;
        follow_up_date: string | null;
        follow_up_note: string | null;
        first_contact_at: string | null;
        created_at: string;
      }[]
    >(
      `select id, name, company, email, phone, notes, campaign_source, value,
              column_id, position, status, created_via,
              follow_up_date, follow_up_note, first_contact_at, created_at
         from "${schema}".crm_leads
        order by column_id, position asc, created_at desc`,
    );

    const columns: Column[] = cols.map((c) => ({
      id: c.id,
      title: c.title,
      order: c.order,
      organizationId: slug,
      color: c.color,
    }));

    const leads: Lead[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      company: r.company,
      email: r.email,
      whatsapp: r.phone,
      campaignSource: r.campaign_source,
      status: r.status ?? "active",
      columnId: r.column_id,
      position: r.position,
      organizationId: slug,
      notes: r.notes,
      value: r.value,
      followUpDate: r.follow_up_date,
      followUpNote: r.follow_up_note,
      firstContactAt: r.first_contact_at,
      createdAt: r.created_at,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      pagePath: null,
      formData: null,
      createdVia: r.created_via,
    }));

    return { columns, leads };
  } catch {
    return { columns: [], leads: [] };
  }
}

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
