// Shim de tipos para reusar os componentes de kanban do crm-unico no painel.
// NÃO é Drizzle: são só os tipos que os componentes leem. Os dados vêm de
// lib/kanban.ts (getBoard), que monta objetos nesse formato a partir das
// tabelas "<schema>".crm_columns / crm_leads.

export type Column = {
  id: string;
  title: string;
  order: number;
  organizationId: string;
  color: string | null;
};

export type Lead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  whatsapp: string | null;
  campaignSource: string | null;
  status: string;
  columnId: string | null;
  position: number;
  organizationId: string;
  notes: string | null;
  value: string | null;
  followUpDate: string | Date | null;
  followUpNote: string | null;
  firstContactAt: string | Date | null;
  createdAt: string | Date;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  pagePath: string | null;
  formData: Record<string, string> | null;
  createdVia: string | null;
};
