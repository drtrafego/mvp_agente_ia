"use client";

import * as React from "react";
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
  canSeeCost = false,
  onBack,
}: {
  slug: string;
  /** Prefixo de rota do agente: /org/<empresa>/<agente>. */
  basePath: string;
  conversation: ConversationRow;
  messages: MessageRow[];
  isPaused: boolean;
  sendEnabled: boolean;
  templates: ApprovedTemplate[];
  /** Custo de IA só aparece para o super admin (dono). */
  canSeeCost?: boolean;
  onBack?: () => void;
}) {
  // ÂNCORA DE SCROLL (01/09/2026, junto com a atualização automática).
  // Com a tela se atualizando sozinha, mensagem nova não pode arrastar quem
  // está lendo mensagem antiga. Regra: só desce sozinho quem JÁ estava no fim.
  const areaRef = React.useRef<HTMLDivElement>(null);
  const coladoNoFim = React.useRef(true);
  const sessaoRef = React.useRef<string | null>(null);
  const ultimaId = messages[messages.length - 1]?.id ?? null;

  React.useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    // Conversa nova abre na mensagem mais recente, que é o que se espera de um
    // chat (e sem isso a pessoa abriria no topo e nunca veria o que chegou).
    if (sessaoRef.current !== conversation.session_id) {
      sessaoRef.current = conversation.session_id;
      coladoNoFim.current = true;
    }
    if (coladoNoFim.current) el.scrollTop = el.scrollHeight;
  }, [conversation.session_id, ultimaId]);

  function aoRolar() {
    const el = areaRef.current;
    if (!el) return;
    // 64px de folga: "quase no fim" já conta como fim.
    coladoNoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border glass shadow-soft">
      <div className="flex items-start gap-3 border-b border-border px-3 py-3 sm:px-4 sm:py-3.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-muted transition-colors hover:text-fg lg:hidden"
            aria-label="Voltar"
          >
            <ArrowLeft className="size-4" />
          </button>
        ) : (
          <Link
            href={`${basePath}/conversas`}
            scroll={false}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-muted transition-colors hover:text-fg lg:hidden"
            aria-label="Voltar"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
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
          {canSeeCost ? (
            <div className="hidden items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted sm:flex">
              <DollarSign className="size-3.5 text-accent" />
              <span className="tnum font-medium text-fg">
                {formatUSD(conversation.cost_usd)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={areaRef}
        onScroll={aoRolar}
        className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-3 sm:p-6"
      >
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-2">
            Nenhuma mensagem registrada nesta conversa.
          </p>
        ) : (
          messages.map((m, i) => (
            <Bubble
              key={m.id}
              message={m}
              channel={conversation.channel}
              slug={slug}
              // nome so na PRIMEIRA mensagem de cada bloco do mesmo falante:
              // repetir em toda bolha vira ruido numa conversa longa
              nomeLead={conversation.title ?? conversation.chat_id ?? "Cliente"}
              mostrarNome={i === 0 || messages[i - 1]?.role !== m.role}
            />
          ))
        )}
      </div>

      {/* ‼️ 01/09/2026. Sem `key`, o React reaproveitava a MESMA instância ao
          trocar de conversa e o estado interno vinha junto: o rascunho escrito
          pro cliente A continuava no campo depois de abrir o cliente B (um
          Enter mandava a mensagem pro WhatsApp errado), e o `sent`, as
          respostas enviadas agora, aparecia dentro da conversa de outra
          pessoa. `sent` é o ÚNICO lugar onde o atendente vê a própria resposta,
          porque o sync do banco só roda de 15 em 15 minutos. Trocou de sessão,
          o componente nasce de novo. */}
      <ChatControls
        key={conversation.session_id}
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
  nomeLead,
  mostrarNome,
}: {
  message: MessageRow;
  channel: string | null;
  slug: string;
  nomeLead?: string;
  mostrarNome?: boolean;
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
        // CONTRASTE ENTRE OS DOIS LADOS (24/08). Antes a bolha do agente era um
        // azul com 20% de opacidade: sobre o fundo escuro ficava quase do mesmo
        // cinza da bolha do cliente, e o Gastao lia mensagem de cliente achando
        // que era da Nina. Agora sao duas cores solidas da mesma familia:
        // cinza pro cliente, azul da marca pro agente.
        className={`min-w-0 max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "rounded-bl-sm border border-border-strong bg-surface-3 text-fg"
            : "rounded-br-sm border border-secondary bg-primary text-primary-fg"
        }`}
      >
        {mostrarNome && nomeLead ? (
          <span
            className={`mb-1 block text-[11px] uppercase tracking-wide ${
              isUser ? "text-muted" : "text-primary-fg/75"
            }`}
          >
            {isUser ? nomeLead : "Nina"}
          </span>
        ) : null}
        {text ? (
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text}</p>
        ) : null}
        {message.sent_email ? (
          <div className="mt-2 rounded-lg border border-emerald-400/45 bg-emerald-500/10 px-2.5 py-2">
            <div className="mb-1 text-[11px] font-semibold text-emerald-500 dark:text-emerald-300">
              📧 E-mail enviado
            </div>
            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg [overflow-wrap:anywhere]">
              {message.sent_email}
            </p>
          </div>
        ) : null}
        {message.reasoning ? (
          <details className="mt-2 rounded-lg border border-dashed border-violet-400/40 bg-violet-500/5 px-2.5 py-1.5">
            <summary className="cursor-pointer select-none text-[11px] font-medium text-violet-500 dark:text-violet-300">
              🧠 raciocínio do agente (clique para ver)
            </summary>
            <p className="mt-1 whitespace-pre-wrap break-words text-[12px] italic leading-snug text-violet-600/80 dark:text-violet-200/70 [overflow-wrap:anywhere]">
              {message.reasoning}
            </p>
          </details>
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
        className={`${wrap} w-full min-w-0 rounded-lg`}
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
