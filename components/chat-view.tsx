import Link from "next/link";
import { ArrowLeft, Bot, User, DollarSign, FileText } from "lucide-react";
import type { ConversationRow, MessageRow } from "@/lib/queries";
import type { ApprovedTemplate } from "@/lib/actions";
import { ChannelIcon } from "./channel-icon";
import { ChatControls } from "./chat-controls";
import { SyncNowButton } from "./sync-now-button";
import { cleanMessage, type MediaItem } from "@/lib/clean-content";
import { formatDateTime, formatUSD } from "@/lib/utils";

export function ChatView({
  slug,
  basePath,
  conversation,
  messages,
  isPaused,
  sendEnabled,
  templates,
}: {
  slug: string;
  /** Prefixo de rota do agente: /org/<empresa>/<agente>. */
  basePath: string;
  conversation: ConversationRow;
  messages: MessageRow[];
  isPaused: boolean;
  sendEnabled: boolean;
  templates: ApprovedTemplate[];
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border glass shadow-soft">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3.5">
        <Link
          href={`${basePath}/conversas`}
          scroll={false}
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted transition-colors hover:text-fg lg:hidden"
          aria-label="Voltar"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-3 text-muted">
          <ChannelIcon channel={conversation.channel} className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold leading-tight">
            {conversation.title ?? "Conversa sem título"}
          </h2>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <span className="tnum truncate">
              {conversation.chat_id ?? "sem contato"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SyncNowButton slug={slug} />
          <div className="hidden items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted sm:flex">
            <DollarSign className="size-3.5 text-accent" />
            <span className="tnum font-medium text-fg">
              {formatUSD(conversation.cost_usd)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-2">
            Nenhuma mensagem registrada nesta conversa.
          </p>
        ) : (
          messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              channel={conversation.channel}
              slug={slug}
            />
          ))
        )}
      </div>

      <ChatControls
        slug={slug}
        chatId={conversation.chat_id}
        isPaused={isPaused}
        messageCount={messages.length}
        sendEnabled={sendEnabled}
        templates={templates}
      />
    </div>
  );
}

function Bubble({
  message,
  channel,
  slug,
}: {
  message: MessageRow;
  channel: string | null;
  slug: string;
}) {
  const isUser = message.role === "user";
  const { text, media } = cleanMessage(message.content, message.role, channel);
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
            : "brand-gradient text-white ring-1 ring-accent-2/40"
        }`}
      >
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </div>
      <div
        className={`min-w-0 max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "rounded-bl-sm bg-surface-2 text-fg"
            : "rounded-br-sm bg-gradient-to-br from-secondary/20 to-accent-2/15 text-fg ring-1 ring-inset ring-secondary/25"
        }`}
      >
        {text ? (
          <p className="whitespace-pre-wrap break-words">{text}</p>
        ) : null}
        {media.map((m, i) => (
          <MediaBlock
            key={`${m.file}-${i}`}
            item={m}
            slug={slug}
            spaced={!!text || i > 0}
          />
        ))}
        {message.ts ? (
          <span className="mt-1 block text-[10px] text-muted-2">
            {formatDateTime(message.ts)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MediaBlock({
  item,
  slug,
  spaced,
}: {
  item: MediaItem;
  slug: string;
  spaced: boolean;
}) {
  const src = `/api/media?agente=${encodeURIComponent(
    slug,
  )}&file=${encodeURIComponent(item.file)}`;
  const wrap = spaced ? "mt-2" : "";

  if (item.kind === "audio") {
    return (
      <audio
        controls
        preload="metadata"
        src={src}
        className={`${wrap} w-full min-w-[220px] rounded-lg`}
      />
    );
  }

  if (item.kind === "image") {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className={`${wrap} block`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Imagem enviada"
          loading="lazy"
          className="max-h-72 w-auto max-w-full rounded-xl border border-border object-cover shadow-soft transition-opacity hover:opacity-90"
        />
      </a>
    );
  }

  if (item.kind === "video") {
    return (
      <video
        controls
        preload="metadata"
        src={src}
        className={`${wrap} max-h-72 w-full max-w-full rounded-xl border border-border`}
      />
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className={`${wrap} flex items-center gap-2 rounded-xl border border-border bg-surface-2/70 px-3 py-2 text-xs font-medium text-fg transition-colors hover:bg-surface-3`}
    >
      <FileText className="size-4 shrink-0 text-secondary" />
      <span className="truncate">{item.file}</span>
    </a>
  );
}
