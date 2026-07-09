import Link from "next/link";
import { MessagesSquare, Inbox, UserSearch, MessageCircle, Mail } from "lucide-react";
import {
  getBotConversations,
  getConversation,
  getMessages,
  getLeadForConversation,
  getOutreachConvos,
  getOutreachConvo,
  getOutreachMessages,
  type ConvChannel,
  type ConvOrigin,
  type ConvFilter,
} from "@/lib/queries";
import { Badge } from "@/components/ui";
import { ChatView } from "@/components/chat-view";
import { OutreachChat } from "@/components/outreach-chat";
import { LeadCard } from "@/components/lead-card";
import { getPausedChatIds, getApprovedTemplates } from "@/lib/actions";
import { getMetaConfig } from "@/lib/meta-config";
import { cn, formatNumber, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ORIGIN_TONE: Record<ConvOrigin, "secondary" | "violet" | "neutral"> = {
  Anúncio: "secondary",
  Prospecção: "violet",
  Direto: "neutral",
};

type ListItem = {
  key: string;
  kind: "bot" | "outreach";
  href: string;
  active: boolean;
  title: string;
  handle: string | null;
  origin: ConvOrigin;
  date: string | null;
  count: number | null;
};

export default async function ConversasPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    c?: string;
    o?: string;
    ch?: string;
    f?: string;
  }>;
}) {
  const { slug } = await params;
  const { c, o, ch: chParam, f: fParam } = await searchParams;
  const ch: ConvChannel = chParam === "email" ? "email" : "whatsapp";
  const filter: ConvFilter =
    fParam === "ativas24h" || fParam === "responderam" ? fParam : "all";

  const [botConvos, outreachConvos] = await Promise.all([
    getBotConversations(slug, ch, filter),
    getOutreachConvos(slug, ch, filter),
  ]);

  const selectedBot = c ? await getConversation(slug, c) : null;
  const selectedOutreach = o ? await getOutreachConvo(slug, o) : null;
  const anySelected = !!(selectedBot || selectedOutreach);

  // Dados só do que estiver selecionado.
  const messages = selectedBot
    ? await getMessages(slug, selectedBot.session_id)
    : [];
  const paused = selectedBot?.chat_id ? await getPausedChatIds(slug) : [];
  const isPaused = selectedBot?.chat_id
    ? paused.includes(selectedBot.chat_id)
    : false;
  const lead = selectedBot ? await getLeadForConversation(selectedBot) : null;
  const sendEnabled = !!getMetaConfig(slug);
  const templates =
    selectedBot && sendEnabled ? await getApprovedTemplates(slug) : [];
  const outreachMessages = selectedOutreach
    ? await getOutreachMessages(selectedOutreach.id)
    : [];

  const fq = filter !== "all" ? `&f=${filter}` : "";
  const items: ListItem[] = [
    ...botConvos.map((cv) => ({
      key: `b-${cv.session_id}`,
      kind: "bot" as const,
      href: `/${slug}/conversas?ch=${ch}${fq}&c=${encodeURIComponent(cv.session_id)}`,
      active: selectedBot?.session_id === cv.session_id,
      title: cv.title ?? "Conversa sem título",
      handle: cv.chat_id,
      origin: cv.origin,
      date: cv.started_at,
      count: cv.message_count,
    })),
    ...outreachConvos.map((oc) => ({
      key: `o-${oc.id}`,
      kind: "outreach" as const,
      href: `/${slug}/conversas?ch=${ch}${fq}&o=${encodeURIComponent(oc.id)}`,
      active: selectedOutreach?.id === oc.id,
      title: oc.lead_name ?? oc.lead_handle ?? "Lead",
      handle: oc.lead_handle,
      origin: "Prospecção" as ConvOrigin,
      date: oc.last_at,
      count: oc.msg_count,
    })),
  ].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  return (
    <div className="animate-fade-in flex h-[calc(100dvh-3.5rem)] flex-col gap-3 p-3 sm:p-4 lg:h-dvh">
      <div className="flex shrink-0 items-baseline justify-between gap-3 px-1">
        <h1 className="text-gradient text-lg font-semibold tracking-tight sm:text-xl">
          Conversas
        </h1>
        <span className="text-xs text-muted">
          {formatNumber(items.length)} nesta aba
        </span>
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <ChannelTabs slug={slug} ch={ch} filter={filter} />
        <FilterChips slug={slug} ch={ch} filter={filter} />
      </div>

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
                <Link
                  key={it.key}
                  href={it.href}
                  scroll={false}
                  className={cn(
                    "block rounded-xl border p-3 transition-all duration-150",
                    it.active
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
                </Link>
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
          {selectedBot ? (
            <div className="min-h-0 flex-1">
              <ChatView
                slug={slug}
                conversation={selectedBot}
                messages={messages}
                isPaused={isPaused}
                sendEnabled={sendEnabled}
                templates={templates}
              />
            </div>
          ) : selectedOutreach ? (
            <div className="min-h-0 flex-1">
              <OutreachChat
                slug={slug}
                ch={ch}
                convo={selectedOutreach}
                messages={outreachMessages}
              />
            </div>
          ) : (
            <Placeholder />
          )}
        </section>

        {/* ---- Painel do lead (só bot, desktop largo) ---- */}
        {selectedBot ? (
          <aside className="hidden min-h-0 w-[20rem] shrink-0 overflow-y-auto xl:block">
            {lead ? <LeadCard lead={lead} /> : <NoAttribution />}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function ChannelTabs({
  slug,
  ch,
  filter,
}: {
  slug: string;
  ch: ConvChannel;
  filter: ConvFilter;
}) {
  const fq = filter !== "all" ? `&f=${filter}` : "";
  const tabs: { key: ConvChannel; label: string; icon: React.ReactNode }[] = [
    { key: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="size-4" /> },
    { key: "email", label: "E-mail", icon: <Mail className="size-4" /> },
  ];
  return (
    <div className="flex w-full shrink-0 gap-1 rounded-xl border border-border bg-surface-2/60 p-1 sm:w-auto">
      {tabs.map((t) => {
        const active = t.key === ch;
        return (
          <Link
            key={t.key}
            href={`/${slug}/conversas?ch=${t.key}${fq}`}
            scroll={false}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none",
              active
                ? "brand-gradient text-white"
                : "text-muted hover:text-fg",
            )}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

function FilterChips({
  slug,
  ch,
  filter,
}: {
  slug: string;
  ch: ConvChannel;
  filter: ConvFilter;
}) {
  const chips: { key: ConvFilter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "ativas24h", label: "Ativas 24h" },
    { key: "responderam", label: "Responderam" },
  ];
  return (
    <div className="flex w-full shrink-0 gap-1 overflow-x-auto sm:w-auto">
      {chips.map((chip) => {
        const active = chip.key === filter;
        const fq = chip.key !== "all" ? `&f=${chip.key}` : "";
        return (
          <Link
            key={chip.key}
            href={`/${slug}/conversas?ch=${ch}${fq}`}
            scroll={false}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-transparent brand-gradient text-white"
                : "border-border bg-surface-2/60 text-muted hover:text-fg",
            )}
          >
            {chip.label}
          </Link>
        );
      })}
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
