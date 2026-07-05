import { ClipboardList, MousePointerClick, Phone, Mail, User } from "lucide-react";
import type { MetaLead } from "@/lib/queries";

export function LeadCard({ lead }: { lead: MetaLead | null }) {
  if (!lead) return null;

  const isCtwa = lead.source === "ctwa";
  const OriginIcon = isCtwa ? MousePointerClick : ClipboardList;
  const originLabel = isCtwa
    ? "Veio de anúncio (clique no WhatsApp)"
    : "Veio de formulário Meta";

  return (
    <section className="rounded-2xl border border-border glass p-4 shadow-soft">
      <div className="flex items-center gap-1.5 text-xs font-medium text-secondary">
        <OriginIcon className="size-3.5" />
        {originLabel}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/20 text-secondary ring-1 ring-primary/40">
          <User className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">
            {lead.full_name ?? lead.phone ?? "Lead sem nome"}
          </p>
          <div className="mt-0.5 flex flex-col gap-0.5 text-[11px] text-muted">
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
    </section>
  );
}
