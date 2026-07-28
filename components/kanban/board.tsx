"use client";

import { useState, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
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
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Column, ColumnPresentation } from "./column";
import { LeadCardPresentation } from "./lead-card";
import { Lead as LeadType, Column as ColumnType } from "@/server/db/schema";
import { updateLeadStatus, updateColumnOrder, createColumn } from "@/server/actions/leads";
import { Button } from "@/components/shadcn/button";
import { PlusIcon } from "lucide-react";
import { Input } from "@/components/shadcn/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/shadcn/dialog";
import { Label } from "@/components/shadcn/label";
import { CRMActionOverrides } from "@/types/crm-actions";

interface BoardProps {
  columns: ColumnType[];
  initialLeads: LeadType[];
  orgId: string;
  overrides?: CRMActionOverrides;
}

// Referência estável para colunas vazias (evita novo array [] a cada render)
const EMPTY_LEADS: LeadType[] = [];

// Ordena por data de criação, mais recente primeiro. Usado para manter todas as
// colunas do kanban sempre ordenadas por data (o lead do dia fica no topo).
function byCreatedAtDesc(a: LeadType, b: LeadType): number {
  const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return tb - ta;
}

// Monta o mapa de ordenação: para cada coluna, a lista ordenada de ids de lead.
// Leads órfãos (columnId nulo/inválido) caem na primeira coluna, como no getLeadsByColumn original.
function buildContainers(columns: ColumnType[], leads: LeadType[]): Record<string, string[]> {
  const firstId = columns[0]?.id;
  const map: Record<string, string[]> = {};
  columns.forEach((c) => {
    map[c.id] = leads
      .filter((lead) => {
        if (lead.columnId === c.id) return true;
        if (c.id === firstId && (!lead.columnId || !columns.some((cc) => cc.id === lead.columnId))) return true;
        return false;
      })
      .sort(byCreatedAtDesc)
      .map((l) => l.id);
  });
  return map;
}

export function Board({ columns: initialColumns, initialLeads, orgId, overrides }: BoardProps) {
  const router = useRouter();
  const [columns, setColumns] = useState<ColumnType[]>(initialColumns);
  const [leads, setLeads] = useState<LeadType[]>(initialLeads);
  const [containers, setContainers] = useState<Record<string, string[]>>(() => buildContainers(initialColumns, initialLeads));

  // Item ativo do drag (para o DragOverlay)
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"lead" | "column" | null>(null);

  // Add Column State
  const [isCreateColumnOpen, setIsCreateColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);

  // Actions
  const updateLeadStatusAction = overrides?.updateLeadStatus || updateLeadStatus;
  const updateColumnOrderAction = overrides?.updateColumnOrder || updateColumnOrder;
  const createColumnAction = overrides?.createColumn || createColumn;

  // Guarda de onde o lead saiu, para evitar chamada de servidor desnecessária quando ele volta ao mesmo lugar
  const dragOriginRef = useRef<{ container: string; index: number } | null>(null);

  // Sincroniza o estado local com as props quando elas mudam de referência.
  // Feito DURANTE o render (padrão recomendado do React "adjusting state when a prop
  // changes"), e NÃO em useEffect: chamar setState dentro de effect gera cascading
  // renders e era a origem do travamento e do React #185 ao mover cards no desktop.
  // Enquanto um card está sendo arrastado (activeId != null) não sincroniza, para
  // não descartar o reposicionamento otimista no meio do gesto.
  const [prevLeadsRef, setPrevLeadsRef] = useState(initialLeads);
  const [prevColumnsRef, setPrevColumnsRef] = useState(initialColumns);
  if (
    activeId === null &&
    (initialLeads !== prevLeadsRef || initialColumns !== prevColumnsRef)
  ) {
    setPrevLeadsRef(initialLeads);
    setPrevColumnsRef(initialColumns);
    setColumns(initialColumns);
    setLeads(initialLeads);
    setContainers(buildContainers(initialColumns, initialLeads));
  }

  const sensors = useSensors(
    // Desktop: começa a arrastar após mover 4px (clique curto abre a edição).
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Mobile: segurar 220ms ativa o arraste (com preventDefault, o card acompanha o dedo);
    // mover antes dos 220ms cancela o drag e deixa a rolagem acontecer normalmente.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    // Sem KeyboardSensor de proposito: os cards ficariam focaveis e a barra de espaco
    // viraria "pegar card", quebrando a digitacao (fantasma se mexendo no fundo).
  );

  const columnIds = useMemo(() => columns.map((c) => c.id), [columns]);

  const leadsById = useMemo(() => {
    const m: Record<string, LeadType> = {};
    leads.forEach((l) => { m[l.id] = l; });
    return m;
  }, [leads]);

  // Referência estável das listas por coluna. Só muda quando a ordenação (containers)
  // ou os dados (leadsById) mudam, evitando recriar arrays a cada render e travar o dnd-kit.
  const leadsByColumn = useMemo(() => {
    const map: Record<string, LeadType[]> = {};
    for (const colId of Object.keys(containers)) {
      map[colId] = containers[colId].map((id) => leadsById[id]).filter(Boolean) as LeadType[];
    }
    return map;
  }, [containers, leadsById]);

  const isColumnId = (id: string) => columns.some((c) => c.id === id);

  const findContainer = (id: string): string | undefined => {
    if (isColumnId(id)) return id;
    return columnIds.find((colId) => containers[colId]?.includes(id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    const type = event.active.data.current?.type === "column" ? "column" : "lead";
    setActiveId(id);
    setActiveType(type);
    if (type === "lead") {
      const container = findContainer(id);
      dragOriginRef.current = container
        ? { container, index: containers[container].indexOf(id) }
        : null;
    } else {
      dragOriginRef.current = null;
    }
  };

  // Move o lead entre colunas em tempo real enquanto arrasta
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.data.current?.type !== "lead") return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    const overIsColumn = isColumnId(overId);

    setContainers((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      if (!activeItems || !overItems) return prev;

      const newIndex = overIsColumn
        ? overItems.length
        : (() => {
            const i = overItems.indexOf(overId);
            return i >= 0 ? i : overItems.length;
          })();

      return {
        ...prev,
        [activeContainer]: activeItems.filter((id) => id !== activeId),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          activeId,
          ...overItems.slice(newIndex),
        ],
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const type = active.data.current?.type;
    setActiveId(null);
    setActiveType(null);

    if (!over) return;

    // Reordenar colunas
    if (type === "column") {
      const oldIndex = columns.findIndex((c) => c.id === active.id);
      const newIndex = columns.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const newColumns = arrayMove(columns, oldIndex, newIndex);
      setColumns(newColumns);
      updateColumnOrderAction(newColumns.map((c) => c.id), orgId)
        .then((response) => {
          if (response.columns) {
            setColumns(response.columns);
            router.refresh();
          }
        })
        .catch((err) => {
          console.error("Failed to update column order:", err);
          setLastError(`Erro ao salvar ordem das colunas: ${err.message} `);
        });
      return;
    }

    // Mover lead
    const leadId = active.id as string;
    const overId = over.id as string;
    const container = findContainer(overId);
    if (!container) return;

    // Como a ordem dentro da coluna é sempre por data, arrastar dentro da mesma
    // coluna não muda nada. Só há mudança real quando troca de coluna.
    const origin = dragOriginRef.current;
    if (origin && origin.container === container) return;

    // Optimistic: troca a coluna do lead e reordena tudo por data (mesma ordenação
    // que o servidor vai devolver), evitando o card "pular" de lugar ao soltar.
    const nextLeads = leads.map((l) => (l.id === leadId ? { ...l, columnId: container } : l));
    setLeads(nextLeads);
    setContainers(buildContainers(columns, nextLeads));

    // A posição não influencia mais a ordem (ordenamos por data), então passamos 0.
    updateLeadStatusAction(leadId, container, 0, orgId)
      .catch((err) => {
        console.error("Failed to update lead status:", err);
        setLastError(`Erro ao salvar status do lead: ${err.message}`);
      });
  };

  async function handleCreateColumn() {
    if (!newColumnName.trim()) return;
    await createColumnAction(newColumnName, orgId);
    setNewColumnName("");
    setIsCreateColumnOpen(false);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
        {lastError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative mb-2 mx-4" role="alert">
            <strong className="font-bold">Erro! </strong>
            <span className="block sm:inline">{lastError}</span>
            <span className="absolute top-0 bottom-0 right-0 px-4 py-2" onClick={() => setLastError(null)}>
              <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" /></svg>
            </span>
          </div>
        )}

        <div className="flex-1 flex gap-3 sm:gap-6 lg:gap-8 overflow-auto px-2 sm:px-4 lg:px-6 pb-20 items-start h-full w-full custom-scrollbar bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl sm:rounded-3xl">
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            {columns.map((col) => (
              <Column
                key={col.id}
                column={col}
                leads={leadsByColumn[col.id] ?? EMPTY_LEADS}
                orgId={orgId}
                overrides={overrides}
              />
            ))}
          </SortableContext>

          <Dialog open={isCreateColumnOpen} onOpenChange={setIsCreateColumnOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-[60px] min-w-[320px] shrink-0 rounded-3xl transition-all duration-500",
                  "bg-white/40 dark:bg-white/5 border-dashed border-2 border-slate-200 dark:border-white/10 text-slate-400 dark:text-white/40 font-black uppercase tracking-widest text-[10px]",
                  "hover:bg-white dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/30 hover:text-indigo-600 dark:hover:text-white hover:scale-[1.02] active:scale-95",
                  "shadow-xl"
                )}
              >
                <PlusIcon className="mr-2 h-4 w-4" />
                Nova Etapa
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-3xl shadow-3xl">
              <DialogHeader>
                <DialogTitle className="font-black uppercase tracking-tighter text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">Nova Etapa do Funil</DialogTitle>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <div className="grid gap-3">
                  <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-white/40 ml-1">Nome da Coluna</Label>
                  <Input
                    id="name"
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    placeholder="Ex: Qualificação Estratégica"
                    className="bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-2xl h-12 focus:ring-indigo-500/50"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateColumn}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-black px-8 h-12 rounded-2xl shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all hover:scale-105"
                >
                  Criar Etapa
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeId && activeType === "lead" && leadsById[activeId] ? (
          <LeadCardPresentation lead={leadsById[activeId]} />
        ) : activeId && activeType === "column" ? (
          <ColumnPresentation
            column={columns.find((c) => c.id === activeId)!}
            count={containers[activeId]?.length ?? 0}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
