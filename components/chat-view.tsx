import Link from "next/link";
import { ArrowLeft, Bot, User, DollarSign } from "lucide-react";
import type { ConversationRow, MessageRow, MetaLead } from "@/lib/queries";
import { Badge } from "./ui";
import { ChannelIcon } from "./channel-icon";
import { ChatControls } from "./chat-controls";
import { LeadCard } from "./lead-card";
import { cleanMessage } from "@/lib/clean-content";
import { channelLabel, formatDateTime, formatUSD } from "@/lib/utils";

export function ChatView({
  slug,
  conversation,
  messages,
  isPaused,
  lead,
}: {
  slug: string;
  conversation: ConversationRow;
  messages: MessageRow[];
  isPaused: boolean;
  lead: MetaLead | null;
}) {
  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col rounded-xl border border-border bg-surface">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <Link
          href={`/${slug}/conversas`}
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted transition-colors hover:text-fg lg:hidden"
          aria-label="Voltar"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            {conversation.title ?? "Conversa sem título"}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone="secondary">
              <ChannelIcon channel={conversation.channel} />
              {channelLabel(conversation.channel)}
            </Badge>
            <span className="tnum">{conversation.chat_id ?? "sem contato"}</span>
            <span className="text-muted-2">·</span>
            <span>{formatDateTime(conversation.started_at)}</span>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted sm:flex">
          <DollarSign className="size-3.5 text-accent" />
          <span className="tnum font-medium text-fg">
            {formatUSD(conversation.cost_usd)}
          </span>
        </div>
      </div>

      <LeadCard lead={lead} />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-2">
            Nenhuma mensagem registrada nesta conversa.
          </p>
        ) : (
          messages.map((m) => (
            <Bubble key={m.id} message={m} channel={conversation.channel} />
          ))
        )}
      </div>

      <ChatControls
        slug={slug}
        chatId={conversation.chat_id}
        isPaused={isPaused}
        messageCount={messages.length}
      />
    </div>
  );
}

function Bubble({
  message,
  channel,
}: {
  message: MessageRow;
  channel: string | null;
}) {
  const isUser = message.role === "user";
  const content = cleanMessage(message.content, message.role, channel);
  return (
    <div
      className={`flex items-end gap-2.5 ${
        isUser ? "justify-start" : "flex-row-reverse justify-start"
      }`}
    >
      <div
        className={`grid size-7 shrink-0 place-items-center rounded-full ${
          isUser
            ? "bg-surface-3 text-muted"
            : "bg-primary/20 text-secondary ring-1 ring-primary/40"
        }`}
      >
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </div>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "rounded-bl-sm bg-surface-2 text-fg"
            : "rounded-br-sm bg-primary/15 text-fg ring-1 ring-inset ring-primary/25"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{content}</p>
        {message.ts ? (
          <span className="mt-1 block text-[10px] text-muted-2">
            {formatDateTime(message.ts)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
