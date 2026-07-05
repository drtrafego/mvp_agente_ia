import Link from "next/link";
import { MessagesSquare, Inbox, UserSearch } from "lucide-react";
import {
  getConversations,
  getConversation,
  getMessages,
  getLeadForConversation,
} from "@/lib/queries";
import { Badge } from "@/components/ui";
import { ChannelIcon } from "@/components/channel-icon";
import { ChatView } from "@/components/chat-view";
import { LeadCard } from "@/components/lead-card";
import { getPausedChatIds, getApprovedTemplates } from "@/lib/actions";
import { getMetaConfig } from "@/lib/meta-config";
import { cn } from "@/lib/utils";
import { channelLabel, formatNumber, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const { c } = await searchParams;

  const conversations = await getConversations(slug);
  const selected = c ? await getConversation(slug, c) : null;
  const messages = selected ? await getMessages(slug, selected.session_id) : [];
  const paused = selected?.chat_id ? await getPausedChatIds(slug) : [];
  const isPaused = selected?.chat_id
    ? paused.includes(selected.chat_id)
    : false;
  const lead = selected ? await getLeadForConversation(selected) : null;
  const sendEnabled = !!getMetaConfig(slug);
  const templates =
    selected && sendEnabled ? await getApprovedTemplates(slug) : [];

  return (
    <div className="animate-fade-in flex h-[calc(100dvh-3.5rem)] flex-col gap-3 p-3 sm:p-4 lg:h-dvh">
      <div className="flex shrink-0 items-baseline justify-between gap-3 px-1">
        <h1 className="text-gradient text-lg font-semibold tracking-tight sm:text-xl">
          Conversas
        </h1>
        <span className="text-xs text-muted">
          {formatNumber(conversations.length)} atendimentos
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ---- Lista ---- */}
        <aside
          className={cn(
            "flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border glass shadow-soft lg:w-80 xl:w-[22rem]",
            selected && "hidden lg:flex",
          )}
        >
          {conversations.length === 0 ? (
            <EmptyList />
          ) : (
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
              {conversations.map((conv) => {
                const active = selected?.session_id === conv.session_id;
                return (
                  <Link
                    key={conv.session_id}
                    href={`/${slug}/conversas?c=${encodeURIComponent(conv.session_id)}`}
                    scroll={false}
                    className={cn(
                      "block rounded-xl border p-3 transition-all duration-150",
                      active
                        ? "border-secondary/40 bg-gradient-to-r from-secondary/15 to-accent-2/10 ring-1 ring-inset ring-secondary/25"
                        : "border-transparent hover:border-border hover:bg-surface-2",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {conv.title ?? "Conversa sem título"}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-2">
                        {timeAgo(conv.started_at)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                      <Badge tone="neutral">
                        <ChannelIcon channel={conv.channel} />
                        {channelLabel(conv.channel)}
                      </Badge>
                      <span className="tnum truncate">
                        {conv.chat_id ?? "sem contato"}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-2">
                      <span className="tnum">
                        {formatNumber(conv.message_count ?? 0)} mensagens
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </aside>

        {/* ---- Chat ---- */}
        <section
          className={cn(
            "min-h-0 flex-1 flex-col gap-3",
            selected ? "flex" : "hidden lg:flex",
          )}
        >
          {selected ? (
            <>
              {lead ? (
                <div className="shrink-0 xl:hidden">
                  <LeadCard lead={lead} />
                </div>
              ) : null}
              <div className="min-h-0 flex-1">
                <ChatView
                  slug={slug}
                  conversation={selected}
                  messages={messages}
                  isPaused={isPaused}
                  sendEnabled={sendEnabled}
                  templates={templates}
                />
              </div>
            </>
          ) : (
            <Placeholder />
          )}
        </section>

        {/* ---- Painel do lead (desktop largo) ---- */}
        {selected ? (
          <aside className="hidden min-h-0 w-[20rem] shrink-0 overflow-y-auto xl:block">
            {lead ? (
              <LeadCard lead={lead} />
            ) : (
              <NoAttribution />
            )}
          </aside>
        ) : null}
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

function EmptyList() {
  return (
    <div className="grid flex-1 place-items-center p-10 text-center">
      <div>
        <Inbox className="mx-auto mb-3 size-8 text-muted-2" />
        <p className="font-medium">Nenhuma conversa ainda</p>
        <p className="mt-1 text-sm text-muted">
          Este agente ainda não registrou atendimentos.
        </p>
      </div>
    </div>
  );
}
