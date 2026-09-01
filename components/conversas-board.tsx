"use client";

import * as React from "react";
import {
  MessagesSquare,
  Inbox,
  UserSearch,
  Mail,
  Loader2,
  AlertTriangle,
  Search,
  X,
} from "lucide-react";
import type {
  ConvFilter,
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
import { ConversasContexto } from "@/components/status-atualizacao";
import { useAtualizacaoAutomatica } from "@/lib/use-atualizacao-automatica";
import { ChatView } from "@/components/chat-view";
import { OutreachChat } from "@/components/outreach-chat";
import { DispatchView } from "@/components/dispatch-view";
import { LeadCard } from "@/components/lead-card";
import { cn, formatNumber, timeAgo } from "@/lib/utils";

// Cor por FAMÍLIA de origem, não por rótulo: mídia paga da Meta puxa o mesmo
// tom (o cliente lê "veio de anúncio" de relance), saída ativa nossa puxa
// outro, e quem chegou sozinho fica neutro.
const ORIGIN_TONE: Record<
  ConvOrigin,
  "secondary" | "violet" | "neutral" | "accent"
> = {
  Instagram: "secondary",
  Facebook: "secondary",
  "Meta Ads": "secondary",
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
  /** Caminho e campanha da origem, quando o dado existe. */
  originDetail?: string | null;
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

// O dado só muda quando o sync roda (de 15 em 15 min), então a maioria dos
// ciclos de atualização devolve exatamente a mesma coisa. Estas duas
// assinaturas existem pra reconhecer isso e NÃO trocar o estado à toa: sem
// elas a tela re-renderizaria de graça a cada ciclo, e quem está lendo uma
// conversa sentiria a piscada.
function assinaturaLista(itens: BoardItem[]): string {
  return itens
    .map((i) => `${i.key}|${i.date ?? ""}|${i.count ?? 0}|${i.title}`)
    .join(";");
}

function assinaturaPainel(p: PanelPayload): string {
  if (p.kind === "bot") {
    const ultima = p.messages[p.messages.length - 1];
    return `bot|${p.messages.length}|${ultima?.id ?? ""}|${p.isPaused}|${p.conversation.title ?? ""}`;
  }
  if (p.kind === "outreach") {
    const ultima = p.messages[p.messages.length - 1];
    return `outreach|${p.messages.length}|${ultima?.id ?? ""}|${p.convo.status ?? ""}`;
  }
  return `dispatch|${p.detail.phone_norm}|${p.detail.sent_at ?? ""}`;
}

export function ConversasBoard({
  slug,
  basePath,
  ch,
  filter,
  items,
  initialKey,
  initialPayload,
  canSeeCost = false,
  header,
}: {
  slug: string;
  basePath: string;
  ch: ConvChannel;
  /** Precisa vir junto: a atualização automática refaz a MESMA consulta. */
  filter: ConvFilter;
  items: BoardItem[];
  initialKey: string | null;
  initialPayload: PanelPayload | null;
  canSeeCost?: boolean;
  header?: React.ReactNode;
}) {
  const [search, setSearch] = React.useState("");
  // A lista vira estado do CLIENTE porque ela se atualiza sozinha. O servidor
  // manda a primeira, e depois manda de novo em toda navegação real (troca de
  // aba/filtro, "Atualizar agora"): nesses casos a dele vale.
  const [itens, setItens] = React.useState<BoardItem[]>(items);
  React.useEffect(() => {
    setItens(items);
  }, [items]);
  // Filtra a lista por nome ou contato (email/telefone). Busca em tudo que já
  // veio (as queries não têm limite), então acha qualquer conversa.
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        (it.handle ?? "").toLowerCase().includes(q),
    );
  }, [itens, search]);
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
    // Marca a entrada como NOSSA. É o que deixa o botão Voltar do painel usar
    // history.back() com segurança: entrada nossa dá pra desempilhar, link
    // direto na conversa não dá.
    window.history.pushState({ painelConversa: true }, "", url.toString());
  }

  function select(item: BoardItem) {
    if (active === item.key) return;
    setActive(item.key);
    setErrorKey(null);
    pushUrl(item.kind, item.id);
    void load(item.kind, item.id, false);
  }

  // ‼️ 01/09/2026: o botão Voltar do painel, que SÓ EXISTE NO CELULAR
  // (`lg:hidden`, porque no desktop lista e chat ficam lado a lado), não
  // funcionava. São DUAS causas empilhadas, e a primeira tentativa de conserto
  // só enxergou a primeira:
  //
  // 1. O botão era um <Link> do Next, e navegação por Link NÃO dispara
  //    `popstate`. Quem zera a seleção é o handler de popstate abaixo, então
  //    ele nunca rodava.
  // 2. O efeito que ressincroniza com o servidor depende de
  //    [initialKey, initialPayload]. Quem abre a conversa pela LISTA abre
  //    client-side (select), e nesse caminho os dois seguem `null` o tempo
  //    todo. O Link trocava a URL, o servidor devolvia `null` de novo, as
  //    dependências NÃO mudavam e o efeito não rodava. A URL perdia o `?c=` e o
  //    painel continuava na tela: o "clico e não faz nada" que ele relatou.
  //    (Por isso o botão parecia funcionar em link direto pra conversa: ali
  //    `initialKey` vinha preenchido e a dependência mudava de verdade.)
  //
  // A correção fecha pelo HISTÓRICO em vez de navegar: `history.back()`
  // desempilha a entrada que nós mesmos criamos, dispara `popstate` de verdade
  // e cai no handler que já funcionava. De quebra o Voltar do sistema para de
  // reabrir a conversa que a pessoa acabou de fechar, que era o que
  // aconteceria empilhando mais uma entrada com pushState.
  const fecharPainel = React.useCallback(() => {
    let entradaNossa = false;
    try {
      entradaNossa = !!(
        window.history.state as { painelConversa?: boolean } | null
      )?.painelConversa;
    } catch {
      entradaNossa = false;
    }
    if (entradaNossa) {
      window.history.back();
      return;
    }
    // Link direto na conversa: não existe entrada nossa pra desempilhar. Fecha
    // na mão e limpa a URL com replaceState, que NÃO empilha entrada nova
    // (com pushState o Voltar do sistema reabriria a conversa).
    setActive(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("c");
      url.searchParams.delete("o");
      url.searchParams.delete("d");
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* URL inválida não pode impedir o painel de fechar */
    }
  }, []);

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

  // ---- Atualização automática (01/09/2026) --------------------------------
  // Pedido do dono: "o pessoal está tendo que apertar F5". Duas frentes, uma
  // barata e outra baratíssima, propositalmente SEPARADAS: quem está só na
  // lista paga 1 requisição por ciclo, quem está com conversa aberta paga 2.
  //
  // Não usa router.refresh() de propósito. O refresh do servidor re-renderiza
  // a página inteira e, quando existe `?c=`, refaz TAMBÉM as consultas do
  // painel: sairia mais caro que estas duas rotas e ainda mexeria na seleção
  // no meio da leitura.
  const activeRef = React.useRef(active);
  React.useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const buscarLista = React.useCallback(
    async (sinal: AbortSignal) => {
      const f = filter !== "all" ? `&f=${filter}` : "";
      const res = await fetch(
        `/api/conversas/lista?slug=${encodeURIComponent(slug)}&ch=${ch}${f}`,
        { cache: "no-store", signal: sinal },
      );
      if (!res.ok) throw new Error(String(res.status));
      const { items: novos } = (await res.json()) as { items: BoardItem[] };
      setItens((antes) =>
        assinaturaLista(antes) === assinaturaLista(novos) ? antes : novos,
      );
    },
    [slug, ch, filter],
  );

  const recarregarPainel = React.useCallback(
    async (chave: string, sinal: AbortSignal) => {
      const corte = chave.indexOf(":");
      const kind = chave.slice(0, corte) as BoardKind;
      const id = chave.slice(corte + 1);
      const res = await fetch(
        `/api/conversas/panel?slug=${encodeURIComponent(slug)}&kind=${kind}&id=${encodeURIComponent(id)}`,
        { cache: "no-store", signal: sinal },
      );
      if (!res.ok) throw new Error(String(res.status));
      const dado = (await res.json()) as PanelPayload;
      setCache((antes) => {
        const atual = antes[chave];
        if (atual && assinaturaPainel(atual) === assinaturaPainel(dado)) {
          return antes;
        }
        return { ...antes, [chave]: dado };
      });
    },
    [slug],
  );

  const atualizar = React.useCallback(
    async (sinal: AbortSignal) => {
      const chave = activeRef.current;
      // Conversa que foi só pré-carregada no hover envelhece calada. A cada
      // ciclo só sobrevive a que está aberta, que é recarregada logo abaixo:
      // assim ninguém abre uma da lista e lê mensagem velha.
      setCache((antes) => {
        const chaves = Object.keys(antes);
        if (chave) {
          if (chaves.length === 1 && chaves[0] === chave) return antes;
          return antes[chave] ? { [chave]: antes[chave] } : {};
        }
        return chaves.length === 0 ? antes : {};
      });
      const [lista] = await Promise.allSettled([
        buscarLista(sinal),
        chave ? recarregarPainel(chave, sinal) : Promise.resolve(),
      ]);
      // A lista é o sinal de saúde do ciclo. O painel falhar sozinho (conversa
      // apagada, por exemplo) não pode jogar a tela inteira no recuo.
      if (lista.status === "rejected") throw lista.reason;
    },
    [buscarLista, recarregarPainel],
  );

  const atualizacao = useAtualizacaoAutomatica({ aoAtualizar: atualizar });

  // Sem isto o indicador ficaria sem horário até o primeiro ciclo (2 min de
  // tela muda). Marcado em efeito, no cliente, pra não divergir do servidor
  // na hidratação.
  const [montadoEm, setMontadoEm] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setMontadoEm(new Date());
  }, []);

  const info = React.useMemo(
    () => ({
      total: itens.length,
      ultimaAtualizacao: atualizacao.ultimaAtualizacao ?? montadoEm,
      atualizando: atualizacao.atualizando,
      falhasSeguidas: atualizacao.falhasSeguidas,
      atualizarAgora: atualizacao.atualizarAgora,
    }),
    [
      itens.length,
      atualizacao.ultimaAtualizacao,
      atualizacao.atualizando,
      atualizacao.falhasSeguidas,
      atualizacao.atualizarAgora,
      montadoEm,
    ],
  );

  const anySelected = active !== null;
  const payload = active ? cache[active] : undefined;
  const activeLoading = active !== null && !payload && loadingKey === active;
  const activeError = active !== null && !payload && errorKey === active;
  const activeItem = active ? itens.find((i) => i.key === active) ?? null : null;
  const lead =
    payload && payload.kind === "bot" ? payload.lead : null;
  const showLeadAside = !!(payload && payload.kind === "bot");

  return (
    <ConversasContexto.Provider value={info}>
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Cabeçalho (título + abas + filtros): some no CELULAR quando uma conversa
          está aberta, pra dar tela cheia ao chat. No desktop fica sempre. */}
      {header ? (
        <div className={cn("shrink-0", anySelected && "hidden lg:block")}>
          {header}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 gap-3">
      {/* ---- Lista ---- */}
      <aside
        className={cn(
          "flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border glass shadow-soft lg:w-80 xl:w-[22rem]",
          anySelected && "hidden lg:flex",
        )}
      >
        <div className="shrink-0 border-b border-border p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, email ou telefone…"
              className="w-full rounded-lg border border-border bg-surface-2 pl-8 pr-10 py-2 text-sm text-fg outline-none placeholder:text-muted-2 focus:border-secondary/50"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Limpar busca"
                className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-2 hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        {itens.length === 0 ? (
          <EmptyList channel={ch} />
        ) : filtered.length === 0 ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-2">
            Nada encontrado para “{search}”.
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
            {filtered.map((it) => (
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
                  <Badge
                    tone={ORIGIN_TONE[it.origin]}
                    title={it.originDetail ?? undefined}
                  >
                    {it.origin}
                  </Badge>
                  <span className="tnum truncate">
                    {it.handle ?? "sem contato"}
                  </span>
                </div>
                {/* Anúncio e campanha embaixo do selo: a plataforma responde
                    "de onde veio", esta linha responde "de qual criativo". */}
                {it.originDetail ? (
                  <p
                    className="mt-1 truncate text-[11px] text-muted-2"
                    title={it.originDetail}
                  >
                    {it.originDetail}
                  </p>
                ) : null}
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
                canSeeCost={canSeeCost}
                onBack={fecharPainel}
              />
            </div>
          ) : payload.kind === "outreach" ? (
            <div className="min-h-0 flex-1">
              <OutreachChat
                basePath={basePath}
                ch={ch}
                convo={payload.convo}
                messages={payload.messages}
                onBack={fecharPainel}
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <DispatchView
                basePath={basePath}
                ch={ch}
                detail={payload.detail}
                onBack={fecharPainel}
              />
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
    </div>
    </ConversasContexto.Provider>
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
