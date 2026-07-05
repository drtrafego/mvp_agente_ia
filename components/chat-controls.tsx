"use client";

import * as React from "react";
import {
  Pause,
  Play,
  Send,
  Loader2,
  AlertTriangle,
  Info,
  Lock,
} from "lucide-react";
import { togglePauseAction, sendReplyAction } from "@/lib/actions";
import { formatNumber } from "@/lib/utils";

export function ChatControls({
  slug,
  chatId,
  isPaused,
  messageCount,
}: {
  slug: string;
  chatId: string | null;
  isPaused: boolean;
  messageCount: number;
}) {
  const [paused, setPaused] = React.useState(isPaused);
  React.useEffect(() => setPaused(isPaused), [isPaused]);

  const [pausePending, startPause] = React.useTransition();
  const [pauseError, setPauseError] = React.useState<string | null>(null);

  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [sentOk, setSentOk] = React.useState(false);

  const disabled = !chatId;

  function handleToggle() {
    if (disabled || pausePending) return;
    setPauseError(null);
    const next = !paused;
    startPause(async () => {
      const res = await togglePauseAction(slug, chatId, next);
      if (res.ok) setPaused(next);
      else setPauseError(res.error ?? "Não foi possível atualizar o bot.");
    });
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (disabled || sending) return;
    const msg = text.trim();
    if (!msg) return;
    setSendError(null);
    setSentOk(false);
    setSending(true);
    const res = await sendReplyAction(slug, chatId, msg);
    setSending(false);
    if (res.ok) {
      setText("");
      setSentOk(true);
      setTimeout(() => setSentOk(false), 2500);
    } else {
      setSendError(res.error ?? "Não foi possível enviar a mensagem.");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="border-t border-border">
      {/* Barra de status + botão pausar/retomar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="tnum">{formatNumber(messageCount)} mensagens</span>
          {!disabled ? (
            <>
              <span className="text-muted-2">·</span>
              <StatusPill paused={paused} />
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled || pausePending}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            paused
              ? "border-success/40 bg-success/15 text-[#4ade80] hover:bg-success/25"
              : "border-accent/40 bg-accent/15 text-accent hover:bg-accent/25"
          }`}
          aria-pressed={paused}
        >
          {pausePending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : paused ? (
            <Play className="size-3.5" />
          ) : (
            <Pause className="size-3.5" />
          )}
          {paused ? "Retomar bot" : "Pausar bot"}
        </button>
      </div>

      {pauseError ? (
        <p className="flex items-center gap-1.5 px-4 pb-2 text-xs text-[#f87171]">
          <AlertTriangle className="size-3.5 shrink-0" />
          {pauseError}
        </p>
      ) : null}

      {/* Composer */}
      <form onSubmit={handleSend} className="border-t border-border p-3">
        {disabled ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-2">
            <Lock className="size-3.5 shrink-0" />
            Conversa sem contato vinculado. Não é possível pausar nem responder.
          </p>
        ) : (
          <>
            {!paused ? (
              <p className="mb-2 flex items-center gap-1.5 text-[11px] text-accent">
                <Info className="size-3.5 shrink-0" />
                O bot está ativo e também vai responder. Pause para assumir a
                conversa.
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Escreva uma resposta ao lead…"
                className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-fg outline-none transition-colors placeholder:text-muted-2 focus:border-secondary/50 focus:ring-1 focus:ring-secondary/40"
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="brand-gradient inline-flex h-[42px] items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </div>
            {sendError ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-[#f87171]">
                <AlertTriangle className="size-3.5 shrink-0" />
                {sendError}
              </p>
            ) : sentOk ? (
              <p className="mt-2 text-xs text-[#4ade80]">
                Mensagem enviada ao lead.
              </p>
            ) : null}
          </>
        )}
      </form>
    </div>
  );
}

function StatusPill({ paused }: { paused: boolean }) {
  return paused ? (
    <span className="inline-flex items-center gap-1 text-[#4ade80]">
      <span className="size-1.5 rounded-full bg-[#4ade80]" />
      Bot pausado, você assumiu
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-accent">
      <span className="size-1.5 rounded-full bg-accent" />
      Bot ativo
    </span>
  );
}
