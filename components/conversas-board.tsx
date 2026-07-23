"use client";

import * as React from "react";
import {
  MessagesSquare,
  Inbox,
  UserSearch,
  Mail,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type {
  ConversationRow,
  MessageRow,
  MetaLead,
  OutreachConvo,
  OutreachMsg,
  DispatchDetail,
  ConvChannel,
  ConvOrigin,
} from "@/lib/queries";
import type { ApprovedTemplate } from "@/lib/actions";
import { Badge } from "@/components/ui";
import { ChatView } from "@/components/chat-view";
import { OutreachChat } from "@/components/outreach-chat";
import { DispatchView } from "@/components/dispatch-view";
import { LeadCard } from "@/components/lead-card";
import { cn, formatNumber, timeAgo } from "@/lib/utils";

const ORIGIN_TONE: Record<
  ConvOrigin,
  "secondary" | "violet" | "neutral" | "accent"
> = {
  Anúncio: "secondary",
  Prospecção: "violet",
  Disparo: "accent",
  Direto: "neutral",
};

export type BoardKind = "bot" | "outreach" | "dispatch";

export type BoardItem = {
  key: string; // `${kind}:${id}`
  kind: BoardKind;
  id: string; // session_id | outreach id | phone_norm
  title: string;
  handle: string | null;
  origin: ConvOrigin;
  date: string | null;
  count: number | null;
};

export type BotPayload = {
  kind: "bot";
  conversation: ConversationRow;
  messages: MessageRow[];
  isPaused: boolean;
  sendEnabled: boolean;
  templates: ApprovedTemplate[];
  lead: MetaLead | null;
};
type OutreachPayload = {
  kind: "outreach";
  convo: OutreachConvo;
  messages: OutreachMsg[];
};
type DispatchPayload = { kind: "dispatch"; detail: DispatchDetail };
export type PanelPayload = BotPayload | OutreachPayload | DispatchPayload;

const PARAM: Record<BoardKind, "c" | "o" | "d"> = {
  bot: "c",
  outreach: "o",
  dispatch: "d",
};

export function ConversasBoard({
  slug,
  basePath,
  ch,
  items,
  initialKey,
  initialPayload,
}: {
  slug: string;
  basePath: string;
  ch: ConvChannel;
  items: BoardItem[];
  initialKey: string | null;
  initialPayload: PanelPayload | null;
}) {
  const [active, setActive] = React.useState<string | null>(initialKey);
  const [cache, setCache] = React.useState<Record<string, PanelPayload>>(() =>
    initialKey && initialPayload ? { [initialKey]: initialPayload } : {},
  );
  const [loadingKey, setLoadingKey] = React.useState<string | null>(null);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const inflight = React.useRef<Set<string>>(new Set());

  // Renderizações vindas do servidor (router.refresh do "Atualizar agora",
  // troca de aba/filtro): a seleção e o painel do servidor viram a verdade.
  // Cache dos outros é descartado para não servir mensagens velhas pós-sync.
  React.useEffect(() => {
    inflight.current.clear();
    setLoadingKey(null);
    setErrorKey(null);
    setActive(initialKey);
    setCache(initialKey && initialPayload ? { [initialKey]: initialPayload } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey, initialPayload]);

  const load = React.useCallback(
    async (kind: BoardKind, id: string, silent: boolean) => {
      const key = `${kind}:${id}`;
      if (cacheHas(key)) return;
      if (inflight.current.has(key)) return;
      inflight.current.add(key);
      if (!silent) {
        setLoadingKey(key);
        setErrorKey((prev) => (prev === key ? null : prev));
      }
      try {
        const res = await fetch(
          `/api/conversas/panel?slug=${encodeURIComponent(slug)}&kind=${kind}&id=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as PanelPayload;
        setCache((prev) => ({ ...prev, [key]: data }));
        setErrorKey((prev) => (prev === key ? null : prev));
      } catch {
        if (!silent) setErrorKey(key);
      } finally {
        inflight.current.delete(key);
        setLoadingKey((prev) => (prev === key ? null : prev));
      }
      function cacheHas(k: string) {
        return Object.prototype.hasOwnProperty.call(cache, k);
      }
    },
    [slug, cache],
  );

  function pushUrl(kind: BoardKind, id: string) {
    const url = new URL(window.location.href);
    url.searchParams.delete("c");
    url.searchParams.delete("o");
    url.searchParams.delete("d");
    url.searchParams.set(PARAM[kind], id);
    window.history.pushState(null, "", url.toString());
  }

  function select(item: BoardItem) {
    if (active === item.key) return;
    setActive(item.key);
    setErrorKey(null);
    pushUrl(item.kind, item.id);
    void load(item.kind, item.id, false);
  }

  // Back/forward do navegador: mantém painel e URL em sincronia.
  React.useEffect(() => {
    function onPop() {
      const sp = new URLSearchParams(window.location.search);
      const c = sp.get("c");
      const o = sp.get("o");
      const d = sp.get("d");
      let next: { kind: BoardKind; id: string } | null = null;
      if (c) next = { kind: "bot", id: c };
      else if (o) next = { kind: "outreach", id: o };
      else if (d) next = { kind: "dispatch", id: d };
      if (!next) {
        setActive(null);
        return;
      }
      setActive(`${next.kind}:${next.id}`);
      void load(next.kind, next.id, false);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  const anySelected = active !== null;
  const payload = active ? cache[active] : undefined;
  const activeLoading = active !== null && !payload && loadingKey === active;
  const activeError = active !== null && !payload && errorKey === active;
  const activeItem = active ? items.find((i) => i.key === active) ?? null : null;
  const lead =
    payload && payload.kind === "bot" ? payload.lead : null;
  const showLeadAside = !!(payload && payload.kind === "bot");

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {/* ---- Lista ---- */}
      <aside
        className={cn(
          "flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border glass shadow-soft lg:w-80 xl:w-[22rem]",
          anySelected && "hidden lg:flex",
        )}
      >
        {items.length === 0 ? (
          <EmptyList channel={ch} />
        ) : (
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
            {items.map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={() => select(it)}
                onMouseEnter={() => void load(it.kind, it.id, true)}
                onFocus={() => void load(it.kind, it.id, true)}
                className={cn(
                  "block w-full text-left rounded-xl border p-3 transition-all duration-150",
                  it.key === active
                    ? "border-secondary/40 bg-gradient-to-r from-secondary/15 to-accent-2/10 ring-1 ring-inset ring-secondary/25"
                    : "border-transparent hover:border-border hover:bg-surface-2",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {it.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-2">
                    {timeAgo(it.date)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                  <Badge tone={ORIGIN_TONE[it.origin]}>{it.origin}</Badge>
                  <span className="tnum truncate">
                    {it.handle ?? "sem contato"}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-muted-2">
                  <span className="tnum">
                    {formatNumber(it.count ?? 0)} mensagens
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* ---- Chat ---- */}
      <section
        className={cn(
          "min-h-0 flex-1 flex-col gap-3",
          anySelected ? "flex" : "hidden lg:flex",
        )}
      >
        {payload ? (
          payload.kind === "bot" ? (
            <div className="min-h-0 flex-1">
              <ChatView
                slug={slug}
                basePath={basePath}
                conversation={payload.conversation}
                messages={payload.messages}
                isPaused={payload.isPaused}
                sendEnabled={payload.sendEnabled}
                templates={payload.templates}
              />
            </div>
          ) : payload.kind === "outreach" ? (
            <div className="min-h-0 flex-1">
              <OutreachChat
                basePath={basePath}
                ch={ch}
                convo={payload.convo}
                messages={payload.messages}
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <DispatchView basePath={basePath} ch={ch} detail={payload.detail} />
            </div>
          )
        ) : activeError ? (
          <PanelError
            onRetry={() =>
              activeItem && void load(activeItem.kind, activeItem.id, false)
            }
          />
        ) : activeLoading || anySelected ? (
          <PanelSkeleton title={activeItem?.title ?? null} />
        ) : (
          <Placeholder />
        )}
      </section>

      {/* ---- Painel do lead (só bot, desktop largo) ---- */}
      {showLeadAside ? (
        <aside className="hidden min-h-0 w-[20rem] shrink-0 overflow-y-auto xl:block">
          {lead ? <LeadCard lead={lead} /> : <NoAttribution />}
        </aside>
      ) : null}
    </div>
  );
}

function PanelSkeleton({ title }: { title: string | null }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border glass shadow-soft">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
        <div className="size-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {title ?? <span className="inline-block h-4 w-40 animate-pulse rounded bg-surface-2 align-middle" />}
          </div>
          <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-surface-2" />
        </div>
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-2" />
      </div>
      <div className="flex-1 space-y-4 overflow-hidden p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}
          >
            <div
              className={cn(
                "h-12 animate-pulse rounded-2xl bg-surface-2",
                i % 3 === 0 ? "w-2/3" : i % 3 === 1 ? "w-1/2" : "w-3/5",
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid h-full place-items-center rounded-2xl border border-dashed border-border glass text-center">
      <div>
        <AlertTriangle className="mx-auto mb-3 size-8 text-[#f87171]" />
        <p className="font-medium">Não foi possível abrir a conversa</p>
        <p className="mt-1 text-sm text-muted">
          Verifique a conexão e tente de novo.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg border border-border bg-surface-2 px-3.5 py-1.5 text-sm font-medium text-fg transition-colors hover:border-secondary/50"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}

function Placeholder() {
  return (
    <div className="grid h-full place-items-center rounded-2xl border border-dashed border-border glass text-center">
      <div>
        <MessagesSquare className="mx-auto mb-3 size-8 text-muted-2" />
        <p className="font-medium">Selecione uma conversa</p>
        <p className="mt-1 text-sm text-muted">
          Clique em um atendimento na lista para ver o histórico completo.
        </p>
      </div>
    </div>
  );
}

function NoAttribution() {
  return (
    <div className="grid h-full min-h-[12rem] place-items-center rounded-2xl border border-dashed border-border glass p-6 text-center">
      <div>
        <UserSearch className="mx-auto mb-2.5 size-7 text-muted-2" />
        <p className="text-sm font-medium">Sem atribuição de campanha</p>
        <p className="mt-1 text-xs text-muted">
          Nenhum lead de formulário ou anúncio casou com este contato.
        </p>
      </div>
    </div>
  );
}

function EmptyList({ channel }: { channel: ConvChannel }) {
  return (
    <div className="grid flex-1 place-items-center p-10 text-center">
      <div>
        {channel === "email" ? (
          <Mail className="mx-auto mb-3 size-8 text-muted-2" />
        ) : (
          <Inbox className="mx-auto mb-3 size-8 text-muted-2" />
        )}
        <p className="font-medium">
          {channel === "email"
            ? "Nenhuma conversa de e-mail"
            : "Nenhuma conversa ainda"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {channel === "email"
            ? "Não há atendimentos nem prospecção por e-mail para este agente."
            : "Este agente ainda não registrou atendimentos."}
        </p>
      </div>
    </div>
  );
}
