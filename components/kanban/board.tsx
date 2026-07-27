"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Plus, Check, X } from "lucide-react";
import type { KanbanBoard, KanbanColumn, KanbanLead } from "@/lib/kanban";
import { moveLead, createColumn } from "@/lib/kanban-actions";
import { Column } from "./column";
import { LeadCardView } from "./card";

type Containers = Record<string, string[]>;

function build(columns: KanbanColumn[], leads: KanbanLead[]): Containers {
  const first = columns[0]?.id;
  const map: Containers = {};
  columns.forEach((c) => (map[c.id] = []));
  // Ordena por posição e, empate, mais recente primeiro.
  const sorted = [...leads].sort(
    (a, b) =>
      a.position - b.position ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  for (const lead of sorted) {
    const col = map[lead.columnId] ? lead.columnId : first;
    if (col) map[col].push(lead.id);
  }
  return map;
}

export function KanbanBoardView({
  slug,
  board,
}: {
  slug: string;
  board: KanbanBoard;
}) {
  const router = useRouter();
  const { columns } = board;

  const leadsById = React.useMemo(() => {
    const m: Record<string, KanbanLead> = {};
    board.leads.forEach((l) => (m[l.id] = l));
    return m;
  }, [board.leads]);

  const [containers, setContainers] = React.useState<Containers>(() =>
    build(columns, board.leads),
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // Re-sincroniza com o servidor quando os dados mudam (e não há arraste ativo).
  const [prev, setPrev] = React.useState(board.leads);
  if (activeId === null && board.leads !== prev) {
    setPrev(board.leads);
    setContainers(build(columns, board.leads));
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
  );

  const isColumn = (id: string) => columns.some((c) => c.id === id);
  const findContainer = (id: string): string | undefined => {
    if (isColumn(id)) return id;
    return Object.keys(containers).find((c) => containers[c].includes(id));
  };

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeContainer = findContainer(String(active.id));
    const overContainer = findContainer(String(over.id));
    if (!activeContainer || !overContainer || activeContainer === overContainer)
      return;
    setContainers((prevC) => {
      const from = [...prevC[activeContainer]];
      const to = [...prevC[overContainer]];
      const idx = from.indexOf(String(active.id));
      if (idx < 0) return prevC;
      from.splice(idx, 1);
      const overIdx = to.indexOf(String(over.id));
      to.splice(overIdx >= 0 ? overIdx : to.length, 0, String(active.id));
      return { ...prevC, [activeContainer]: from, [overContainer]: to };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const id = String(active.id);
    setActiveId(null);
    if (!over) return;
    const container = findContainer(over.id ? String(over.id) : id);
    if (!container) return;

    let index = 0;
    setContainers((prevC) => {
      const list = [...prevC[container]];
      const oldIndex = list.indexOf(id);
      const overIndex = isColumn(String(over.id))
        ? list.length - 1
        : list.indexOf(String(over.id));
      const newList =
        oldIndex >= 0 && overIndex >= 0
          ? arrayMove(list, oldIndex, Math.max(0, overIndex))
          : list;
      index = Math.max(0, newList.indexOf(id));
      return { ...prevC, [container]: newList };
    });

    try {
      await moveLead(slug, id, container, index);
    } catch {
      router.refresh();
    }
  }

  const activeLead = activeId ? leadsById[activeId] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => (
          <Column
            key={col.id}
            slug={slug}
            column={col}
            leads={(containers[col.id] ?? [])
              .map((id) => leadsById[id])
              .filter(Boolean)}
          />
        ))}
        <AddColumn slug={slug} onDone={() => router.refresh()} />
      </div>
      <DragOverlay>
        {activeLead ? <LeadCardView lead={activeLead} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function AddColumn({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await createColumn(slug, title);
      setTitle("");
      setOpen(false);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-56 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted transition-colors hover:border-accent/50 hover:text-fg"
      >
        <Plus className="size-4" />
        Nova coluna
      </button>
    );
  }

  return (
    <div className="flex w-64 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface p-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Nome da coluna"
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-fg outline-none placeholder:text-muted-2 focus:border-secondary/50"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50"
      >
        <Check className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
