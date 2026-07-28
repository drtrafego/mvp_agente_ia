"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Phone, Mail, StickyNote } from "lucide-react";
import type { KanbanLead } from "@/lib/kanban";
import { timeAgo } from "@/lib/utils";
import { LeadModal } from "./lead-modal";

// Aparência do card (sem lógica de arraste), reusada pelo card sortável e pelo
// DragOverlay (o "fantasma" que segue o cursor).
export function LeadCardView({
  lead,
  dragging,
}: {
  lead: KanbanLead;
  dragging?: boolean;
}) {
  return (
    <div
      className={[
        "select-none rounded-lg border border-border bg-surface-2 p-3 shadow-sm transition-colors",
        dragging ? "rotate-2 shadow-lg ring-1 ring-accent/40" : "hover:border-secondary/40",
      ].join(" ")}
    >
      <p className="text-sm font-medium leading-snug text-fg">{lead.name}</p>
      {lead.phone ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted">
          <Phone className="size-3" />
          {lead.phone}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-muted-2">
          {lead.email ? <Mail className="size-3" /> : null}
          {lead.notes ? <StickyNote className="size-3" /> : null}
          {lead.campaignSource ? (
            <span className="truncate rounded bg-surface-3 px-1.5 py-0.5 text-[10px]">
              {lead.campaignSource}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 text-[10px] text-muted-2">
          {timeAgo(lead.createdAt)}
        </span>
      </div>
    </div>
  );
}

export function LeadCard({ lead, slug }: { lead: KanbanLead; slug: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lead.id, data: { type: "lead", lead } });
  const [open, setOpen] = React.useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => setOpen(true)}
        className="cursor-pointer touch-none"
      >
        <LeadCardView lead={lead} />
      </div>
      {open ? (
        <LeadModal slug={slug} lead={lead} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
