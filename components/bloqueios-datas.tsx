"use client";

import * as React from "react";
import {
  CalendarX2,
  CalendarOff,
  Loader2,
  CheckCircle2,
  TriangleAlert,
  Trash2,
  Plane,
} from "lucide-react";
import {
  blockAgendaDate,
  unblockAgendaDate,
  type AgendaBloqueio,
} from "@/lib/actions";
import { Card } from "@/components/ui";

// Formata "AAAA-MM-DD" como data legível (ex.: "sex, 18 de set de 2026"),
// sem depender de timezone (monta a data ao meio-dia local).
function formatData(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Hoje em "AAAA-MM-DD" (horário local), pra bloquear o passado no seletor.
function hojeISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function BloqueiosDatas({
  slug,
  bloqueios: initial,
}: {
  slug: string;
  bloqueios: AgendaBloqueio[];
}) {
  const [bloqueios, setBloqueios] = React.useState<AgendaBloqueio[]>(initial);
  const [data, setData] = React.useState("");
  const [motivo, setMotivo] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [okMsg, setOkMsg] = React.useState<string | null>(null);

  const minDate = hojeISO();

  async function bloquear() {
    if (saving) return;
    setError(null);
    setOkMsg(null);
    if (!data) {
      setError("Escolha a data que você quer bloquear.");
      return;
    }
    if (bloqueios.some((b) => b.data === data)) {
      setError("Essa data já está bloqueada.");
      return;
    }
    setSaving(true);
    const res = await blockAgendaDate(slug, data, motivo);
    setSaving(false);
    if (res.ok) {
      const novo = [...bloqueios, { data, motivo: motivo.trim() }].sort((a, b) =>
        a.data.localeCompare(b.data),
      );
      setBloqueios(novo);
      setData("");
      setMotivo("");
      setOkMsg("Data bloqueada. O bot não vai oferecer horários nela.");
      setTimeout(() => setOkMsg(null), 3000);
    } else {
      setError(res.error ?? "Falha ao bloquear a data.");
    }
  }

  async function desbloquear(dia: string) {
    if (removing) return;
    setError(null);
    setOkMsg(null);
    setRemoving(dia);
    const res = await unblockAgendaDate(slug, dia);
    setRemoving(null);
    if (res.ok) {
      setBloqueios((prev) => prev.filter((b) => b.data !== dia));
      setOkMsg("Data liberada de volta.");
      setTimeout(() => setOkMsg(null), 3000);
    } else {
      setError(res.error ?? "Falha ao desbloquear a data.");
    }
  }

  return (
    <Card glass className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
          <CalendarX2 className="size-5" />
        </span>
        <div>
          <h3 className="font-semibold">Bloquear data específica</h3>
          <p className="mt-0.5 max-w-xl text-xs text-muted">
            Para folga, viagem ou uma data pontual. O bot deixa de oferecer
            qualquer horário nesse dia, mesmo que ele caia num dia normal de
            atendimento.{" "}
            <span className="text-muted-2">
              Isso não altera a sua regra semanal de horários acima.
            </span>
          </p>
        </div>
      </div>

      {/* Formulário de bloqueio */}
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-2/40 p-3">
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted-2">
            Data
          </label>
          <input
            type="date"
            value={data}
            min={minDate}
            onChange={(e) => {
              setData(e.target.value);
              setError(null);
            }}
            className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50 [color-scheme:dark]"
          />
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted-2">
            Motivo (opcional)
          </label>
          <input
            type="text"
            value={motivo}
            maxLength={120}
            placeholder="Ex.: viagem, congresso, folga"
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-fg outline-none focus:border-secondary/50"
          />
        </div>
        <button
          onClick={bloquear}
          disabled={saving || !data}
          className="brand-gradient inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CalendarOff className="size-4" />
          )}
          Bloquear
        </button>
      </div>

      {/* Lista de datas bloqueadas */}
      <div className="mt-3">
        {bloqueios.length === 0 ? (
          <p className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-2">
            <Plane className="size-3.5 shrink-0" />
            Nenhuma data bloqueada. Todos os dias seguem a regra semanal acima.
          </p>
        ) : (
          <ul className="space-y-2">
            {bloqueios.map((b) => (
              <li
                key={b.data}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/15 text-[#f87171]">
                  <CalendarOff className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium capitalize text-fg">
                    {formatData(b.data)}
                  </p>
                  {b.motivo ? (
                    <p className="truncate text-xs text-muted">{b.motivo}</p>
                  ) : (
                    <p className="text-xs text-muted-2">Sem motivo informado</p>
                  )}
                </div>
                <button
                  onClick={() => desbloquear(b.data)}
                  disabled={removing === b.data}
                  aria-label={`Desbloquear ${b.data}`}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-secondary/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {removing === b.data ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Desbloquear
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(okMsg || error) && (
        <div className="mt-3">
          {okMsg ? (
            <span className="inline-flex items-center gap-1 text-xs text-[#4ade80]">
              <CheckCircle2 className="size-3.5" />
              {okMsg}
            </span>
          ) : null}
          {error ? (
            <span className="inline-flex items-center gap-1 text-xs text-[#f87171]">
              <TriangleAlert className="size-3.5" />
              {error}
            </span>
          ) : null}
        </div>
      )}
    </Card>
  );
}
