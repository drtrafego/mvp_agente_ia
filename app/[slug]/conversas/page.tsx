import Link from "next/link";
import { MessagesSquare, ChevronRight, Inbox } from "lucide-react";
import {
  getConversations,
  getConversation,
  getMessages,
  getLeadForConversation,
} from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui";
import { ChannelIcon } from "@/components/channel-icon";
import { ChatView } from "@/components/chat-view";
import { getPausedChatIds } from "@/lib/actions";
import {
  channelLabel,
  formatDateTime,
  formatNumber,
  timeAgo,
} from "@/lib/utils";

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
  const paused = selected?.chat_id
    ? await getPausedChatIds(slug)
    : [];
  const isPaused = selected?.chat_id
    ? paused.includes(selected.chat_id)
    : false;
  const lead = selected ? await getLeadForConversation(selected) : null;

  return (
    <>
      <PageHeader
        title="Conversas"
        subtitle={`${formatNumber(conversations.length)} atendimentos registrados`}
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div
          className={`${
            selected ? "hidden lg:block" : "block"
          } animate-fade-up space-y-1.5`}
        >
          {conversations.length === 0 ? (
            <EmptyList />
          ) : (
            <div className="max-h-[calc(100dvh-11rem)] space-y-1.5 overflow-y-auto pr-1">
              {conversations.map((conv) => {
                const active = selected?.session_id === conv.session_id;
                return (
                  <Link
                    key={conv.session_id}
                    href={`/${slug}/conversas?c=${encodeURIComponent(conv.session_id)}`}
                    scroll={false}
                    className={`block rounded-lg border p-3 transition-colors duration-150 ${
                      active
                        ? "border-primary/40 bg-primary/10 ring-1 ring-inset ring-primary/30"
                        : "border-border bg-surface hover:border-border-strong hover:bg-surface-2"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {conv.title ?? "Conversa sem título"}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-2" />
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
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-2">
                      <span className="tnum">
                        {formatNumber(conv.message_count ?? 0)} msgs
                      </span>
                      <span>{timeAgo(conv.started_at)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className={`${selected ? "block" : "hidden lg:block"}`}>
          {selected ? (
            <div className="animate-fade-up">
              <ChatView
                slug={slug}
                conversation={selected}
                messages={messages}
                isPaused={isPaused}
                lead={lead}
              />
            </div>
          ) : (
            <Placeholder />
          )}
        </div>
      </div>
    </>
  );
}

function Placeholder() {
  return (
    <div className="grid h-[calc(100dvh-11rem)] place-items-center rounded-xl border border-dashed border-border bg-surface/50 text-center">
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

function EmptyList() {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border p-10 text-center">
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
