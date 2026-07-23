import Link from "next/link";
import { MessageCircle, Mail } from "lucide-react";
import {
  getBotConversations,
  getConversation,
  getMessages,
  getLeadForConversation,
  getOutreachConvos,
  getOutreachConvo,
  getOutreachMessages,
  getDispatchConvos,
  getDispatchConvo,
  type ConvChannel,
  type ConvOrigin,
  type ConvFilter,
} from "@/lib/queries";
import {
  ConversasBoard,
  type BoardItem,
  type PanelPayload,
} from "@/components/conversas-board";
import { getPausedChatIds, getApprovedTemplates } from "@/lib/actions";
import { assertAgentAccess } from "@/lib/access";
import { getMetaConfig } from "@/lib/meta-config";
import { cn, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; slug: string }>;
  searchParams: Promise<{
    c?: string;
    o?: string;
    d?: string;
    ch?: string;
    f?: string;
  }>;
}) {
  const { org, slug } = await params;
  const { c, o, d, ch: chParam, f: fParam } = await searchParams;
  // Gate de acesso antes de qualquer consulta desta tela.
  const agent = await assertAgentAccess(slug);
  const basePath = `/org/${org}/${slug}`;
  const ch: ConvChannel = chParam === "email" ? "email" : "whatsapp";
  const filter: ConvFilter =
    fParam === "ativas24h" || fParam === "responderam" ? fParam : "all";

  const [botConvos, outreachConvos, dispatchConvos] = await Promise.all([
    getBotConversations(slug, ch, filter),
    getOutreachConvos(slug, ch, filter),
    getDispatchConvos(slug, ch, filter),
  ]);

  const sendEnabled = !!getMetaConfig(agent);

  // Seleção inicial (deep-link, refresh ou "Atualizar agora"): monta o payload
  // do painel no servidor. A troca de conversa em si é feita client-side pelo
  // board, sem re-renderizar a lista.
  let initialKey: string | null = null;
  let initialPayload: PanelPayload | null = null;

  if (c) {
    const conversation = await getConversation(slug, c);
    if (conversation) {
      const [messages, paused, lead, templates] = await Promise.all([
        getMessages(slug, conversation.session_id),
        conversation.chat_id ? getPausedChatIds(slug) : Promise.resolve<string[]>([]),
        getLeadForConversation(conversation),
        sendEnabled ? getApprovedTemplates(slug) : Promise.resolve([]),
      ]);
      const isPaused = conversation.chat_id
        ? paused.includes(conversation.chat_id)
        : false;
      initialKey = `bot:${conversation.session_id}`;
      initialPayload = {
        kind: "bot",
        conversation,
        messages,
        isPaused,
        sendEnabled,
        templates,
        lead,
      };
    }
  } else if (o) {
    const convo = await getOutreachConvo(slug, o);
    if (convo) {
      const messages = await getOutreachMessages(convo.id);
      initialKey = `outreach:${convo.id}`;
      initialPayload = { kind: "outreach", convo, messages };
    }
  } else if (d) {
    const detail = await getDispatchConvo(slug, d);
    if (detail) {
      initialKey = `dispatch:${detail.phone_norm}`;
      initialPayload = { kind: "dispatch", detail };
    }
  }

  const items: BoardItem[] = [
    ...botConvos.map((cv) => ({
      key: `bot:${cv.session_id}`,
      kind: "bot" as const,
      id: cv.session_id,
      title: cv.title ?? "Conversa sem título",
      handle: cv.chat_id,
      origin: cv.origin,
      date: cv.started_at,
      count: cv.message_count,
    })),
    ...outreachConvos.map((oc) => ({
      key: `outreach:${oc.id}`,
      kind: "outreach" as const,
      id: oc.id,
      title: oc.lead_name ?? oc.lead_handle ?? "Lead",
      handle: oc.lead_handle,
      origin: "Prospecção" as ConvOrigin,
      date: oc.last_at,
      count: oc.msg_count,
    })),
    ...dispatchConvos.map((dc) => ({
      key: `dispatch:${dc.phone_norm}`,
      kind: "dispatch" as const,
      id: dc.phone_norm,
      title: dc.full_name ?? dc.phone_norm,
      handle: dc.phone_norm,
      origin: "Disparo" as ConvOrigin,
      date: dc.sent_at,
      count: 1,
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
        <ChannelTabs basePath={basePath} ch={ch} filter={filter} />
        <FilterChips basePath={basePath} ch={ch} filter={filter} />
      </div>

      <ConversasBoard
        slug={slug}
        basePath={basePath}
        ch={ch}
        items={items}
        initialKey={initialKey}
        initialPayload={initialPayload}
      />
    </div>
  );
}

function ChannelTabs({
  basePath,
  ch,
  filter,
}: {
  basePath: string;
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
            href={`${basePath}/conversas?ch=${t.key}${fq}`}
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
  basePath,
  ch,
  filter,
}: {
  basePath: string;
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
            href={`${basePath}/conversas?ch=${ch}${fq}`}
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
