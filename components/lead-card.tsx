import {
  ClipboardList,
  MousePointerClick,
  Phone,
  Mail,
  Megaphone,
  Layers,
  Image as ImageIcon,
  Radio,
  User,
} from "lucide-react";
import type { MetaLead } from "@/lib/queries";
import { Badge } from "./ui";
import { formatDateTime } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  full_name: "Nome",
  first_name: "Nome",
  last_name: "Sobrenome",
  nome: "Nome",
  phone: "Telefone",
  phone_number: "Telefone",
  telefone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  "e-mail": "E-mail",
  city: "Cidade",
  state: "Estado",
  company_name: "Empresa",
  job_title: "Cargo",
};

const HIDDEN_FIELDS = new Set([
  "full_name",
  "first_name",
  "last_name",
  "name",
  "nome",
  "phone",
  "phone_number",
  "telefone",
  "whatsapp",
  "email",
  "e-mail",
]);

function fieldLabel(name: string): string {
  const key = name.toLowerCase().trim();
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return name
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LeadCard({ lead }: { lead: MetaLead | null }) {
  if (!lead) return null;

  const attribution = [
    { icon: Megaphone, label: "Campanha", value: lead.campaign_name },
    { icon: Layers, label: "Conjunto", value: lead.adset_name },
    { icon: ImageIcon, label: "Anúncio", value: lead.ad_name },
    { icon: Radio, label: "Plataforma", value: lead.platform },
  ].filter((a) => a.value);

  const extras = (lead.field_data ?? []).filter(
    (f) =>
      f?.name &&
      !HIDDEN_FIELDS.has(f.name.toLowerCase().trim()) &&
      Array.isArray(f.values) &&
      f.values.filter(Boolean).length > 0,
  );

  const isCtwa = lead.source === "ctwa";
  const OriginIcon = isCtwa ? MousePointerClick : ClipboardList;
  const originLabel = isCtwa
    ? "Veio de anúncio (clique no WhatsApp)"
    : "Veio de formulário Meta";
  const adContext = [lead.headline, lead.body]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" — ");

  return (
    <section className="rounded-2xl border border-border glass p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-secondary">
          <OriginIcon className="size-3.5" />
          {originLabel}
          {!isCtwa && lead.form_name ? (
            <span className="text-muted-2">· {lead.form_name}</span>
          ) : null}
        </div>
        {lead.created_time ? (
          <span className="shrink-0 text-[11px] text-muted-2">
            {formatDateTime(lead.created_time)}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/20 text-secondary ring-1 ring-primary/40">
          <User className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">
            {lead.full_name ?? lead.phone ?? "Lead sem nome"}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
            {lead.phone && lead.full_name ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3" />
                <span className="tnum">{lead.phone}</span>
              </span>
            ) : null}
            {lead.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3" />
                <span className="truncate">{lead.email}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {attribution.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {attribution.map((a) => {
            const Icon = a.icon;
            return (
              <Badge key={a.label} tone="secondary" title={a.label}>
                <Icon className="size-3" />
                <span className="max-w-[180px] truncate">{a.value}</span>
              </Badge>
            );
          })}
        </div>
      ) : null}

      {adContext ? (
        <p className="mt-2 line-clamp-2 rounded-md bg-surface-2/60 px-2.5 py-1.5 text-[11px] italic text-muted">
          “{adContext}”
        </p>
      ) : null}

      {extras.length > 0 ? (
        <dl className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {extras.map((f) => (
            <div key={f.name} className="flex gap-1.5 text-[11px]">
              <dt className="shrink-0 text-muted-2">{fieldLabel(f.name)}:</dt>
              <dd className="min-w-0 truncate text-muted">
                {f.values.filter(Boolean).join(", ")}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
