"use client";

import * as React from "react";
import {
  Clock3,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  CheckCircle2,
  TriangleAlert,
  Sparkles,
  Save,
} from "lucide-react";
import {
  saveFollowupConfig,
  type FollowupConfig,
  type FollowupStep,
} from "@/lib/actions";
import { Card } from "@/components/ui";

const PRESETS = [15, 30, 60, 120, 240, 480, 720, 1440];

function labelMin(min: number): string {
  if (min < 60) return `${min} min`;
  if (min % 60 === 0) return `${min / 60}h`;
  return `${Math.floor(min / 60)}h${min % 60}`;
}

export function FollowupCard({
  slug,
  config,
  supported,
}: {
  slug: string;
  config: FollowupConfig;
  supported: boolean;
}) {
  const [enabled, setEnabled] = React.useState(config.enabled);
  const [steps, setSteps] = React.useState<FollowupStep[]>(config.steps);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [okMsg, setOkMsg] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  function touch() {
    setDirty(true);
    setOkMsg(null);
    setError(null);
  }

  function setDelay(i: number, delayMinutes: number) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { delayMinutes } : s)));
    touch();
  }
  function addStep() {
    setSteps((prev) => [...prev, { delayMinutes: 60 }]);
    touch();
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
    touch();
  }
  function move(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    touch();
  }

  async function save(nextEnabled = enabled) {
    if (saving) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    const clean = steps
      .map((s) => ({
        delayMinutes: Math.max(1, Math.round(Number(s.delayMinutes) || 0)),
      }))
      .sort((a, b) => a.delayMinutes - b.delayMinutes);
    const res = await saveFollowupConfig(slug, {
      enabled: nextEnabled,
      steps: clean,
    });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      setOkMsg("Salvo.");
      setTimeout(() => setOkMsg(null), 2000);
    } else {
      setError(res.error ?? "Falha ao salvar.");
      setEnabled(config.enabled);
    }
  }

  function toggle() {
    if (saving || !supported) return;
    const next = !enabled;
    setEnabled(next);
    void save(next);
  }

  return (
    <Card glass className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
            <Clock3 className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">Follow-up automático</h3>
            <p className="mt-0.5 max-w-lg text-xs text-muted">
              A Nina lê a conversa e escreve o follow-up sozinha, retomando de
              onde parou. Você só define <strong>quando</strong> ela manda o
              lembrete (dentro da janela de 72h). Se o lead responder, a
              sequência reinicia.
            </p>
          </div>
        </div>

        <button
          onClick={toggle}
          disabled={saving || !supported}
          aria-pressed={enabled}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? "brand-gradient" : "bg-surface-3"
          }`}
        >
          <span
            className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {!supported ? (
        <p className="mt-4 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-2">
          <TriangleAlert className="size-3.5 shrink-0 text-accent" />
          Este agente não tem número de WhatsApp oficial.
        </p>
      ) : (
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-accent-2/30 bg-accent-2/10 px-3 py-2 text-[11px] text-[#c4b5fd]">
            <Sparkles className="size-3.5 shrink-0" />
            A mensagem de cada lembrete é escrita pela Nina na hora, com base na
            conversa. Aqui você define só os tempos.
          </div>

          {steps.map((step, i) => {
            const isPreset = PRESETS.includes(step.delayMinutes);
            return (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2/40 p-2.5"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent-2/15 text-[11px] font-semibold text-[#c4b5fd]">
                  {i + 1}
                </span>
                <span className="text-[11px] uppercase tracking-wide text-muted-2">
                  Lembrete após
                </span>
                <select
                  value={isPreset ? String(step.delayMinutes) : "custom"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v !== "custom") setDelay(i, Number(v));
                    else setDelay(i, step.delayMinutes);
                  }}
                  className="appearance-none rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50"
                >
                  {PRESETS.map((m) => (
                    <option key={m} value={m}>
                      {labelMin(m)}
                    </option>
                  ))}
                  <option value="custom">Personalizado…</option>
                </select>
                {!isPreset ? (
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      value={step.delayMinutes}
                      onChange={(e) =>
                        setDelay(
                          i,
                          Math.max(1, Math.round(Number(e.target.value) || 0)),
                        )
                      }
                      className="w-20 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50"
                    />
                    <span className="text-[11px] text-muted-2">min</span>
                  </span>
                ) : null}

                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Subir"
                    className="grid size-7 place-items-center rounded-md text-muted-2 hover:text-fg disabled:opacity-30"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === steps.length - 1}
                    aria-label="Descer"
                    className="grid size-7 place-items-center rounded-md text-muted-2 hover:text-fg disabled:opacity-30"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    onClick={() => removeStep(i)}
                    aria-label="Remover"
                    className="grid size-7 place-items-center rounded-md text-muted-2 hover:bg-destructive/15 hover:text-[#f87171]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          <button
            onClick={addStep}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-secondary/40 hover:text-fg"
          >
            <Plus className="size-4" />
            Adicionar tempo
          </button>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={() => save()}
              disabled={saving || !dirty}
              className="brand-gradient inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Salvar
            </button>
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
            <span className="ml-auto text-[11px] text-muted-2">
              {enabled
                ? `${steps.length} lembrete${steps.length === 1 ? "" : "s"} · ativo`
                : "Desligado"}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
