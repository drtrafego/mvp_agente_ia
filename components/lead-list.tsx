"use client";

import * as React from "react";
import Link from "next/link";
import {
  X,
  Phone,
  Mail,
  Megaphone,
  Layers,
  Image as ImageIcon,
  Radio,
  User,
  MessageCircle,
  ArrowRight,
  Clock,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import type { FormLead } from "@/lib/queries";
import { Badge } from "./ui";
import { formatDate, formatDateTime } from "@/lib/utils";

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

export function LeadList({ slug, leads }: { slug: string; leads: FormLead[] }) {
  const [selected, setSelected] = React.useState<FormLead | null>(null);

  return (
    <>
      <div className="animate-fade-up overflow-hidden rounded-2xl border border-border glass shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Campanha
                </th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">
                  Anúncio
                </th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, i) => (
                <tr
                  key={lead.lead_id ?? `${lead.phone_norm}-${i}`}
                  onClick={() => setSelected(lead)}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-2/15 text-[#c4b5fd]">
                        <User className="size-3.5" />
                      </span>
                      <span className="truncate font-medium">
                        {lead.full_name ?? "Sem nome"}
                      </span>
                    </div>
                  </td>
                  <td className="tnum px-4 py-3 text-muted">
                    {lead.phone ?? "—"}
                  </td>
                  <td className="hidden max-w-[200px] truncate px-4 py-3 text-muted md:table-cell">
                    {lead.campaign_name ?? "—"}
                  </td>
                  <td className="hidden max-w-[200px] truncate px-4 py-3 text-muted lg:table-cell">
                    {lead.ad_name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {lead.created_time ? formatDate(lead.created_time) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {lead.conversou ? (
                      <Badge tone="success">
                        <CheckCircle2 className="size-3" />
                        Conversou
                      </Badge>
                    ) : (
                      <Badge tone="accent">
                        <Clock className="size-3" />
                        Aguardando
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <LeadModal
          slug={slug}
          lead={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function LeadModal({
  slug,
  lead,
  onClose,
}: {
  slug: string;
  lead: FormLead;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border glass-2 shadow-soft animate-fade-up sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
              <User className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">
                {lead.full_name ?? "Lead sem nome"}
              </h2>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-secondary">
                <ClipboardList className="size-3.5" />
                Formulário Meta
                {lead.form_name ? (
                  <span className="text-muted-2">· {lead.form_name}</span>
                ) : null}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Contato */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {lead.phone ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Phone className="size-3.5 text-muted-2" />
                <span className="tnum text-fg">{lead.phone}</span>
              </span>
            ) : null}
            {lead.email ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Mail className="size-3.5 text-muted-2" />
                <span className="truncate text-fg">{lead.email}</span>
              </span>
            ) : null}
          </div>

          {/* Atribuição */}
          {attribution.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-2">
                Atribuição
              </p>
              <div className="flex flex-wrap gap-1.5">
                {attribution.map((a) => {
                  const Icon = a.icon;
                  return (
                    <Badge key={a.label} tone="secondary" title={a.label}>
                      <Icon className="size-3" />
                      <span className="max-w-[200px] truncate">{a.value}</span>
                    </Badge>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Campos do formulário */}
          {extras.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-2">
                Respostas do formulário
              </p>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {extras.map((f) => (
                  <div
                    key={f.name}
                    className="rounded-lg border border-border bg-surface-2/50 px-3 py-2"
                  >
                    <dt className="text-[11px] text-muted-2">
                      {fieldLabel(f.name)}
                    </dt>
                    <dd className="mt-0.5 break-words text-sm text-fg">
                      {f.values.filter(Boolean).join(", ")}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {/* Meta info */}
          <div className="flex items-center gap-1.5 text-xs text-muted-2">
            <Clock className="size-3.5" />
            Recebido em{" "}
            {lead.created_time ? formatDateTime(lead.created_time) : "—"}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          {lead.conversou && lead.session_id ? (
            <Link
              href={`/${slug}/conversas?c=${encodeURIComponent(lead.session_id)}`}
              className="brand-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110"
            >
              <MessageCircle className="size-4" />
              Ver conversa
              <ArrowRight className="size-4" />
            </Link>
          ) : (
            <p className="flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-2.5 text-xs text-muted-2">
              <Clock className="size-3.5" />
              Ainda não iniciou conversa no WhatsApp
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
