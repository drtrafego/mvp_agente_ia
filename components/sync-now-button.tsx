"use client";

import * as React from "react";
import { RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { syncNowAction } from "@/lib/actions";

/**
 * Puxa as mensagens novas do bot sob demanda (dispara o sync state.db -> Neon
 * no servidor e revalida a tela), sem esperar o cron de 30 min.
 */
export function SyncNowButton({ slug }: { slug: string }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleClick() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await syncNowAction(slug);
      if (!res.ok) setError(res.error ?? "Não foi possível atualizar.");
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={error ?? "Puxar as mensagens novas do bot"}
      aria-label="Atualizar conversa agora"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        error
          ? "border-destructive/40 bg-destructive/10 text-[#f87171]"
          : "border-border bg-surface-2 text-muted hover:text-fg"
      }`}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : error ? (
        <AlertTriangle className="size-3.5" />
      ) : (
        <RefreshCw className="size-3.5" />
      )}
      <span>{pending ? "Atualizando…" : "Atualizar agora"}</span>
    </button>
  );
}
