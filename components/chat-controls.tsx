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
  LayoutTemplate,
  ChevronDown,
  UserCog,
  X,
} from "lucide-react";
import {
  togglePauseAction,
  sendReplyAction,
  sendTemplateAction,
  type ApprovedTemplate,
} from "@/lib/actions";
import { formatNumber } from "@/lib/utils";

type SentMsg = { id: number; text: string; kind: "text" | "template" };

export function ChatControls({
  slug,
  chatId,
  isPaused,
  messageCount,
  sendEnabled,
  templates,
}: {
  slug: string;
  chatId: string | null;
  isPaused: boolean;
  messageCount: number;
  sendEnabled: boolean;
  templates: ApprovedTemplate[];
}) {
  const [paused, setPaused] = React.useState(isPaused);
  React.useEffect(() => setPaused(isPaused), [isPaused]);

  const [pausePending, startPause] = React.useTransition();
  const [pauseError, setPauseError] = React.useState<string | null>(null);

  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [outsideWindow, setOutsideWindow] = React.useState(false);

  const [sent, setSent] = React.useState<SentMsg[]>([]);
  const seq = React.useRef(0);

  const [tplOpen, setTplOpen] = React.useState(false);

  const noContact = !chatId;
  const canSend = sendEnabled && !noContact;

  function pushSent(text: string, kind: SentMsg["kind"]) {
    setSent((prev) => [...prev, { id: seq.current++, text, kind }]);
  }

  function handleToggle() {
    if (noContact || pausePending) return;
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
    if (!canSend || sending) return;
    const msg = text.trim();
    if (!msg) return;
    setSendError(null);
    setOutsideWindow(false);
    setSending(true);
    const res = await sendReplyAction(slug, chatId, msg);
    setSending(false);
    if (res.ok) {
      setText("");
      pushSent(msg, "text");
    } else {
      setSendError(res.error ?? "Não foi possível enviar a mensagem.");
      if (res.outsideWindow) {
        setOutsideWindow(true);
        setTplOpen(true);
      }
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
      {/* Barra de status + pausar/retomar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="tnum">{formatNumber(messageCount)} mensagens</span>
          {!noContact ? (
            <>
              <span className="text-muted-2">·</span>
              <StatusPill paused={paused} />
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleToggle}
          disabled={noContact || pausePending}
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

      {/* Mensagens enviadas manualmente agora (otimista) */}
      {sent.length > 0 ? (
        <div className="space-y-1.5 border-t border-border bg-surface-2/40 px-4 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-2">
            <UserCog className="size-3" />
            Enviadas por você agora
          </p>
          {sent.map((m) => (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm brand-gradient px-3.5 py-2 text-sm text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.7)]">
                {m.kind === "template" ? (
                  <span className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-white/80">
                    <LayoutTemplate className="size-3" /> Template
                  </span>
                ) : null}
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Composer */}
      <div className="border-t border-border p-3">
        {noContact ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-2">
            <Lock className="size-3.5 shrink-0" />
            Conversa sem contato vinculado. Não é possível pausar nem responder.
          </p>
        ) : !sendEnabled ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-2">
            <Lock className="size-3.5 shrink-0" />
            Este agente não tem número de WhatsApp oficial. Envio manual
            indisponível (a pausa continua funcionando).
          </p>
        ) : (
          <form onSubmit={handleSend}>
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTplOpen((v) => !v)}
                  title="Enviar template aprovado"
                  className={`inline-flex h-[42px] items-center gap-1 rounded-lg border px-2.5 text-sm font-medium transition-colors ${
                    outsideWindow
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : "border-border bg-surface-2 text-muted hover:text-fg"
                  }`}
                >
                  <LayoutTemplate className="size-4" />
                  <ChevronDown className="size-3" />
                </button>
                {tplOpen ? (
                  <TemplatePanel
                    slug={slug}
                    chatId={chatId}
                    templates={templates}
                    onClose={() => setTplOpen(false)}
                    onSent={(label) => {
                      pushSent(label, "template");
                      setTplOpen(false);
                      setSendError(null);
                      setOutsideWindow(false);
                    }}
                  />
                ) : null}
              </div>
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
              <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-[#f87171]">
                <p className="flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {sendError}
                </p>
                {outsideWindow ? (
                  <p className="mt-1 text-[11px] text-accent">
                    Use um template aprovado para reengajar o contato.
                  </p>
                ) : null}
              </div>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}

function TemplatePanel({
  slug,
  chatId,
  templates,
  onClose,
  onSent,
}: {
  slug: string;
  chatId: string | null;
  templates: ApprovedTemplate[];
  onClose: () => void;
  onSent: (label: string) => void;
}) {
  const [selected, setSelected] = React.useState<ApprovedTemplate | null>(null);
  const [vars, setVars] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function send() {
    if (!selected || sending) return;
    setSending(true);
    setError(null);
    const params = vars
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const res = await sendTemplateAction(
      slug,
      chatId,
      selected.name,
      selected.language,
      params,
    );
    setSending(false);
    if (res.ok) {
      const label = params.length
        ? `${selected.name} (${params.join(", ")})`
        : selected.name;
      onSent(label);
    } else {
      setError(res.error ?? "Não foi possível enviar o template.");
    }
  }

  return (
    <div className="absolute bottom-[calc(100%+8px)] right-0 z-20 w-72 rounded-xl border border-border glass-2 p-2.5 shadow-soft">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-xs font-semibold">Templates aprovados</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="grid size-6 place-items-center rounded-md text-muted-2 hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="px-1 py-3 text-center text-xs text-muted-2">
          Nenhum template aprovado disponível.
        </p>
      ) : !selected ? (
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {templates.map((t) => (
            <button
              key={`${t.name}-${t.language}`}
              type="button"
              onClick={() => setSelected(t)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:border-border hover:bg-surface-2"
            >
              <span className="truncate font-medium">{t.name}</span>
              <span className="shrink-0 text-[10px] uppercase text-muted-2">
                {t.language}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg bg-surface-2 px-2.5 py-2">
            <p className="truncate text-sm font-medium">{selected.name}</p>
            <p className="text-[10px] uppercase text-muted-2">
              {selected.language}
              {selected.category ? ` · ${selected.category}` : ""}
            </p>
          </div>
          <input
            value={vars}
            onChange={(e) => setVars(e.target.value)}
            placeholder="Variáveis {{1}}, {{2}} (opcional)"
            className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-fg outline-none placeholder:text-muted-2 focus:border-secondary/50"
          />
          {error ? (
            <p className="flex items-center gap-1.5 text-[11px] text-[#f87171]">
              <AlertTriangle className="size-3 shrink-0" />
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg border border-border px-2.5 py-2 text-xs text-muted hover:text-fg"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="brand-gradient inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Enviar template
            </button>
          </div>
        </div>
      )}
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
