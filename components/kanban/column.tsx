"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { KanbanColumn, KanbanLead } from "@/lib/kanban";
import { createLead } from "@/lib/kanban-actions";
import { LeadCard } from "./card";

// Uma coluna do quadro: cabeçalho (cor + título + contagem) e a lista de cards,
// que é uma zona de soltura (droppable) e um contexto sortável vertical.
export function Column({
  slug,
  column,
  leads,
}: {
  slug: string;
  column: KanbanColumn;
  leads: KanbanLead[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column" },
  });

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-surface/60">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: column.color ?? "var(--muted)" }}
        />
        <h3 className="truncate text-sm font-semibold text-fg">
          {column.title}
        </h3>
        <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">
          {leads.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={[
          "flex min-h-24 flex-1 flex-col gap-2 rounded-b-xl px-2.5 pb-3 pt-1 transition-colors",
          isOver ? "bg-accent/5" : "",
        ].join(" ")}
      >
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>
        {leads.length === 0 ? (
          <p className="grid place-items-center rounded-lg border border-dashed border-border/60 py-5 text-center text-xs text-muted-2">
            Arraste um card aqui
          </p>
        ) : null}
        <AddCard slug={slug} columnId={column.id} />
      </div>
    </div>
  );
}

function AddCard({ slug, columnId }: { slug: string; columnId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await createLead(slug, columnId, { name });
      setName("");
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs text-muted-2 transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Plus className="size-3.5" />
        Adicionar card
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => !name.trim() && setOpen(false)}
        placeholder="Nome do contato"
        className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg outline-none placeholder:text-muted-2 focus:border-secondary/50"
      />
    </div>
  );
}
