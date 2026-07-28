"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LeadCard } from "./lead-card";
import { cn } from "@/lib/utils";
import { Column as ColumnType, Lead } from "@/server/db/schema";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Check, GripVertical, X, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";

import { updateColumn, deleteColumn } from "@/server/actions/leads";
import { useRouter } from "next/navigation";

interface ColumnProps {
  column: ColumnType;
  leads: Lead[];
  orgId: string;
  overrides?: {
    updateColumn?: typeof updateColumn;
    deleteColumn?: typeof deleteColumn;
  };
}

export function Column({ column, leads, orgId, overrides }: ColumnProps) {
  const router = useRouter();
  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState(column.title);
  const isDefault = column.title === "Novos Leads";
  const [isDeleting, setIsDeleting] = useState(false);

  // Actions
  const updateColumnAction = overrides?.updateColumn || updateColumn;
  const deleteColumnAction = overrides?.deleteColumn || deleteColumn;

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: "column" } });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const leadIds = useMemo(() => leads.map((l) => l.id), [leads]);

  const handleUpdateTitle = async () => {
    if (newTitle === column.title) {
      setIsEditing(false);
      return;
    }
    try {
      await updateColumnAction(column.id, newTitle, orgId);
      setIsEditing(false);
      router.refresh();
    } catch (err) {
      console.error("Failed to update column title:", err);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Tem certeza que deseja excluir esta coluna e mover todos os leads para a primeira coluna disponível?")) return;
    setIsDeleting(true);
    try {
      await deleteColumnAction(column.id, orgId);
      router.refresh();
    } catch (err) {
      console.error("Failed to delete column:", err);
      setIsDeleting(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "w-[280px] min-w-[280px] sm:w-[310px] sm:min-w-[310px] lg:w-[340px] lg:min-w-[340px] flex flex-col rounded-2xl sm:rounded-3xl shrink-0 h-fit",
        !isDragging && "transition-all duration-500",
        "glass-panel border-slate-200/40 dark:border-white/5 shadow-2xl",
        isDeleting && "opacity-50 pointer-events-none",
        isDragging && "opacity-40"
      )}
    >
      {/* Header */}
      <div className="p-5 sticky top-0 bg-white/50 dark:bg-slate-900/60 backdrop-blur-md border-b border-slate-200/40 dark:border-white/10 rounded-t-3xl">
        {isEditing ? (
          <div className="flex items-center gap-2 w-full animate-in fade-in zoom-in duration-300">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-9 text-xs font-bold bg-white dark:bg-slate-900/50 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-xl focus:ring-indigo-500/50"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdateTitle();
                if (e.key === 'Escape') setIsEditing(false);
              }}
            />
            <Button size="icon" variant="ghost" className="h-9 w-9 text-emerald-400 hover:bg-emerald-500/20" onClick={handleUpdateTitle}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-9 w-9 text-rose-400 hover:bg-rose-500/20" onClick={() => setIsEditing(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {/* Alça de arraste dedicada da coluna */}
              <button
                type="button"
                aria-label="Arrastar coluna"
                className="touch-manipulation cursor-grab active:cursor-grabbing -ml-1 p-1 rounded-lg text-slate-300 dark:text-white/20 hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors shrink-0"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <span className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-800 dark:text-white/90">{column.title}</span>
              <span className="bg-indigo-500/10 dark:bg-white/10 text-indigo-600 dark:text-white/60 px-2.5 py-0.5 rounded-lg text-xs font-black border border-indigo-500/10 dark:border-white/5 shadow-sm">
                {leads.length}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 dark:text-white/30 hover:text-indigo-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white dark:bg-slate-900/90 backdrop-blur-2xl border border-slate-200 dark:border-white/10 shadow-3xl z-50 rounded-2xl p-1.5">
                <DropdownMenuItem
                  onClick={() => setIsEditing(true)}
                  className="rounded-xl font-bold text-xs uppercase tracking-widest text-slate-700 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-white/10 focus:text-indigo-600 dark:focus:text-white py-2"
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Renomear
                </DropdownMenuItem>
                {!isDefault && (
                  <DropdownMenuItem
                    className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/20 rounded-xl font-bold text-xs uppercase tracking-widest py-2"
                    onClick={handleDelete}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Cards Area */}
      <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
        <div className="p-3 flex-1">
          <div className="flex flex-col gap-1 pb-4 min-h-[60px]">
            {leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} columnId={column.id} />
            ))}
          </div>
        </div>
      </SortableContext>
    </div>
  );
}

// Preview leve renderizado no DragOverlay enquanto a coluna é arrastada.
export function ColumnPresentation({ column, count }: { column: ColumnType; count: number }) {
  return (
    <div className="w-[280px] sm:w-[310px] lg:w-[340px] rounded-2xl sm:rounded-3xl glass-panel border-slate-200/40 dark:border-white/5 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)] ring-2 ring-indigo-500/20 rotate-2">
      <div className="p-5 bg-white/60 dark:bg-slate-900/70 backdrop-blur-md border-b border-slate-200/40 dark:border-white/10 rounded-t-3xl flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-800 dark:text-white/90">{column.title}</span>
        <span className="bg-indigo-500/10 dark:bg-white/10 text-indigo-600 dark:text-white/60 px-2.5 py-0.5 rounded-lg text-xs font-black border border-indigo-500/10 dark:border-white/5 shadow-sm">
          {count}
        </span>
      </div>
    </div>
  );
}
