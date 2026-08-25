"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Pause, Play, ShieldAlert } from "lucide-react";
import { toggleGlobalPauseAction, type GlobalPause } from "@/lib/actions";

/**
 * Liga e desliga o bot INTEIRO deste agente. Diferente do botão da conversa,
 * que cala o bot só para um contato. Pausar aqui derruba o atendimento de todos
 * os leads, então o estado pausado precisa ser impossível de não notar.
 */
export function GlobalPauseCard({
  slug,
  agentName,
  initial,
}: {
  slug: string;
  agentName: string;
  initial: GlobalPause;
}) {
  const [state, setState] = React.useState(initial);
  React.useEffect(() => setState(initial), [initial]);

  const [confirming, setConfirming] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const paused = state.paused;

  function apply(next: boolean) {
    setError(null);
    setConfirming(false);
    startTransition(async () => {
      const res = await toggleGlobalPauseAction(slug, next);
      if (res.ok) {
        setState({
          paused: next,
          since: next ? Math.floor(Date.now() / 1000) : null,
          by: next ? state.by : "",
        });
      } else {
        setError(res.error ?? "Não foi possível mudar o estado do bot.");
      }
    });
  }

  return (
    <section
      className={`mb-6 rounded-xl border transition-colors duration-200 ${
        paused
          ? "border-destructive/50 bg-destructive/10"
          : "border-border bg-surface"
      }`}
      aria-live="polite"
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span
            className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${
              paused
                ? "bg-destructive/20 text-[#f87171]"
                : "bg-surface-2 text-muted"
            }`}
          >
            {paused ? (
              <ShieldAlert className="size-4" />
            ) : (
              <Pause className="size-4" />
            )}
          </span>

          <div className="space-y-1">
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
              Pausar o bot inteiro
              {paused ? <PausedPill /> : null}
            </h2>

            {paused ? (
              <div className="space-y-1 text-xs">
                <p className="font-medium text-[#f87171]">
                  {agentName} não está respondendo nenhum lead agora.
                </p>
                <p className="text-muted">
                  Toda mensagem que chegar fica sem resposta e o follow-up não
                  dispara. Só volta a atender quando alguém retomar aqui.
                </p>
                <PausedSince since={state.since} by={state.by} />
              </div>
            ) : (
              <p className="max-w-prose text-xs text-muted">
                Cala o bot em todas as conversas de uma vez, e também segura o
                follow-up. Use para manutenção ou quando o time quiser assumir o
                atendimento inteiro. A pausa de uma conversa específica continua
                sendo feita dentro dela.
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 sm:pl-4">
          {paused ? (
            <button
              type="button"
              onClick={() => apply(false)}
              disabled={pending}
              aria-pressed={true}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-success/50 bg-success/20 px-3.5 py-2 text-xs font-semibold text-[#4ade80] transition-colors hover:bg-success/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Retomar o bot
            </button>
          ) : !confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={pending}
              aria-pressed={false}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/50 bg-destructive/15 px-3.5 py-2 text-xs font-semibold text-[#f87171] transition-colors hover:bg-destructive/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <Pause className="size-3.5" />
              Pausar o bot
            </button>
          ) : (
            <div className="w-full rounded-lg border border-destructive/40 bg-destructive/10 p-3 sm:w-64">
              <p className="mb-2.5 text-xs text-fg">
                Pausar <span className="font-semibold">{agentName}</span> para
                todos os contatos? Nenhum lead será atendido até você retomar.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-strong"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => apply(true)}
                  disabled={pending}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-destructive px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : null}
                  Sim, pausar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 border-t border-destructive/30 px-5 py-2.5 text-xs text-[#f87171]">
          <AlertTriangle className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </section>
  );
}

function PausedPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#f87171]">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#f87171] opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-[#f87171]" />
      </span>
      Pausado
    </span>
  );
}

/**
 * Há quanto tempo está parado. Só renderiza depois de montar no browser: o
 * relógio do servidor e o do visitante não batem, e isso quebraria a hidratação.
 */
function PausedSince({ since, by }: { since: number | null; by: string }) {
  const [texto, setTexto] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!since) {
      setTexto(null);
      return;
    }
    const calc = () => setTexto(decorrido(since));
    calc();
    const id = setInterval(calc, 30_000);
    return () => clearInterval(id);
  }, [since]);

  if (!texto && !by) return null;
  return (
    <p className="text-muted-2">
      {texto ? `Pausado há ${texto}` : "Pausado"}
      {by ? ` por ${by}` : ""}.
    </p>
  );
}

function decorrido(since: number): string {
  const seg = Math.max(0, Math.floor(Date.now() / 1000) - since);
  if (seg < 60) return "menos de um minuto";
  const min = Math.floor(seg / 60);
  if (min < 60) return `${min} ${min === 1 ? "minuto" : "minutos"}`;
  const h = Math.floor(min / 60);
  const restoMin = min % 60;
  if (h < 24) {
    return restoMin ? `${h}h ${restoMin}min` : `${h} ${h === 1 ? "hora" : "horas"}`;
  }
  const d = Math.floor(h / 24);
  const restoH = h % 24;
  return restoH ? `${d}d ${restoH}h` : `${d} ${d === 1 ? "dia" : "dias"}`;
}
