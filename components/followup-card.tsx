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
  Megaphone,
  MoonStar,
  Shuffle,
} from "lucide-react";
import { saveFollowupConfig } from "@/lib/actions";
import {
  isDelayStep,
  FOLLOWUP_DEFAULT_WINDOW,
  FOLLOWUP_DEFAULT_SPACING,
  type FollowupConfig,
  type FollowupStep,
  type FollowupWindow,
  type FollowupSpacing,
} from "@/lib/followup";
import { Card } from "@/components/ui";

const PRESETS = [15, 30, 60, 120, 240, 480, 720, 1440];

function labelMin(min: number): string {
  if (min < 60) return `${min} min`;
  if (min % 60 === 0) return `${min / 60}h`;
  return `${Math.floor(min / 60)}h${min % 60}`;
}

function delayDe(s: FollowupStep): number {
  return isDelayStep(s) ? s.delayMinutes : 0;
}

/** Uma linha de tempo: "após X" ou "no dia seguinte às H". */
function LinhaTempo({
  step,
  i,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  step: FollowupStep;
  i: number;
  total: number;
  onChange: (s: FollowupStep) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const noDiaSeguinte = !isDelayStep(step);
  const min = delayDe(step);
  const isPreset = PRESETS.includes(min);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2/40 p-2.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent-2/15 text-[11px] font-semibold text-[#c4b5fd]">
        {i + 1}
      </span>

      <select
        value={noDiaSeguinte ? "dia" : "apos"}
        onChange={(e) =>
          onChange(
            e.target.value === "dia"
              ? { nextDayAtHour: 14 }
              : { delayMinutes: 60 },
          )
        }
        className="appearance-none rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50"
      >
        <option value="apos">Após</option>
        <option value="dia">No dia seguinte, às</option>
      </select>

      {noDiaSeguinte ? (
        <span className="inline-flex items-center gap-1">
          <select
            value={String((step as { nextDayAtHour: number }).nextDayAtHour)}
            onChange={(e) => onChange({ nextDayAtHour: Number(e.target.value) })}
            className="appearance-none rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted-2">
            (só para quem não fechou no dia anterior)
          </span>
        </span>
      ) : (
        <>
          <select
            value={isPreset ? String(min) : "custom"}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ delayMinutes: v !== "custom" ? Number(v) : min });
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
                value={min}
                onChange={(e) =>
                  onChange({
                    delayMinutes: Math.max(
                      1,
                      Math.round(Number(e.target.value) || 0),
                    ),
                  })
                }
                className="w-20 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50"
              />
              <span className="text-[11px] text-muted-2">min</span>
            </span>
          ) : null}
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => onMove(-1)}
          disabled={i === 0}
          aria-label="Subir"
          className="grid size-7 place-items-center rounded-md text-muted-2 hover:text-fg disabled:opacity-30"
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={i === total - 1}
          aria-label="Descer"
          className="grid size-7 place-items-center rounded-md text-muted-2 hover:text-fg disabled:opacity-30"
        >
          <ArrowDown className="size-3.5" />
        </button>
        <button
          onClick={onRemove}
          aria-label="Remover"
          className="grid size-7 place-items-center rounded-md text-muted-2 hover:bg-destructive/15 hover:text-[#f87171]"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
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
  const [janela, setJanela] = React.useState<FollowupWindow>(
    config.window ?? FOLLOWUP_DEFAULT_WINDOW,
  );
  const [ritmo, setRitmo] = React.useState<FollowupSpacing>(
    config.spacing ?? FOLLOWUP_DEFAULT_SPACING,
  );
  const [stepsAd, setStepsAd] = React.useState<FollowupStep[]>(
    config.stepsByOrigin?.ad ?? [],
  );
  const [usaAd, setUsaAd] = React.useState(
    (config.stepsByOrigin?.ad?.length ?? 0) > 0,
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [okMsg, setOkMsg] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  function touch() {
    setDirty(true);
    setOkMsg(null);
    setError(null);
  }

  function mexer(
    lista: FollowupStep[],
    set: (v: FollowupStep[]) => void,
    acao: (prev: FollowupStep[]) => FollowupStep[],
  ) {
    set(acao(lista));
    touch();
  }

  async function save(nextEnabled = enabled) {
    if (saving) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    const res = await saveFollowupConfig(slug, {
      enabled: nextEnabled,
      steps,
      window: janela,
      spacing: ritmo,
      ...(usaAd && stepsAd.length ? { stepsByOrigin: { ad: stepsAd } } : {}),
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
    if (saving) return;
    const next = !enabled;
    setEnabled(next);
    void save(next);
  }

  const rotuloHora = (h: number) => `${String(h).padStart(2, "0")}:00`;

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
              O agente lê a conversa e escreve o lembrete sozinho, retomando de
              onde parou. Aqui você define <strong>quando</strong> ele manda, em
              que <strong>horários</strong> pode mandar e o{" "}
              <strong>intervalo</strong> entre uma mensagem e outra. Se a pessoa
              responder, a sequência reinicia.
            </p>
          </div>
        </div>

        <button
          onClick={toggle}
          disabled={saving}
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
        <p className="mt-4 flex items-start gap-1.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-2">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-accent" />
          <span>
            Este agente não usa o WhatsApp oficial, então o disparo{" "}
            <strong>a partir daqui</strong> fica indisponível. Os tempos abaixo
            continuam valendo: quem envia é o serviço do próprio agente, e ele
            lê esta configuração.
          </span>
        </p>
      ) : null}

      <div className="mt-4 space-y-2.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-accent-2/30 bg-accent-2/10 px-3 py-2 text-[11px] text-[#c4b5fd]">
          <Sparkles className="size-3.5 shrink-0" />
          O texto de cada lembrete é escrito pelo agente na hora, com base na
          conversa. Aqui você define só os tempos e as regras de envio.
        </div>

        {steps.map((step, i) => (
          <LinhaTempo
            key={i}
            step={step}
            i={i}
            total={steps.length}
            onChange={(s) =>
              mexer(steps, setSteps, (prev) =>
                prev.map((x, idx) => (idx === i ? s : x)),
              )
            }
            onMove={(dir) =>
              mexer(steps, setSteps, (prev) => {
                const j = i + dir;
                if (j < 0 || j >= prev.length) return prev;
                const next = [...prev];
                [next[i], next[j]] = [next[j], next[i]];
                return next;
              })
            }
            onRemove={() =>
              mexer(steps, setSteps, (prev) => prev.filter((_, idx) => idx !== i))
            }
          />
        ))}

        <button
          onClick={() =>
            mexer(steps, setSteps, (prev) => [...prev, { delayMinutes: 60 }])
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-secondary/40 hover:text-fg"
        >
          <Plus className="size-4" />
          Adicionar tempo
        </button>

        {/* JANELA DE ENVIO */}
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <div className="flex items-center gap-2">
            <MoonStar className="size-4 shrink-0 text-muted-2" />
            <span className="text-xs font-medium">Só enviar entre</span>
            <select
              value={String(janela.startHour)}
              onChange={(e) => {
                setJanela({ ...janela, startHour: Number(e.target.value) });
                touch();
              }}
              className="appearance-none rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {rotuloHora(h)}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-2">e</span>
            <select
              value={String(janela.endHour)}
              onChange={(e) => {
                setJanela({ ...janela, endHour: Number(e.target.value) });
                touch();
              }}
              className="appearance-none rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50"
            >
              {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                <option key={h} value={h}>
                  {rotuloHora(h % 24)}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 pl-6 text-[11px] text-muted-2">
            Fora desse horário nada é enviado, e o que venceu{" "}
            <strong>não se acumula</strong> para disparar tudo junto depois.
          </p>
        </div>

        {/* INTERVALO ENTRE ENVIOS */}
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Shuffle className="size-4 shrink-0 text-muted-2" />
            <span className="text-xs font-medium">
              Intervalo entre uma mensagem e a próxima: de
            </span>
            <input
              type="number"
              min={5}
              max={3600}
              value={ritmo.minSeconds}
              onChange={(e) => {
                setRitmo({
                  ...ritmo,
                  minSeconds: Math.max(5, Math.round(Number(e.target.value) || 0)),
                });
                touch();
              }}
              className="w-20 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50"
            />
            <span className="text-xs text-muted-2">a</span>
            <input
              type="number"
              min={5}
              max={3600}
              value={ritmo.maxSeconds}
              onChange={(e) => {
                setRitmo({
                  ...ritmo,
                  maxSeconds: Math.max(5, Math.round(Number(e.target.value) || 0)),
                });
                touch();
              }}
              className="w-20 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50"
            />
            <span className="text-xs text-muted-2">segundos</span>
          </div>
          <p className="mt-1.5 pl-6 text-[11px] text-muted-2">
            O tempo exato é sorteado dentro dessa faixa a cada envio. Cadência
            fixa (sempre o mesmo intervalo) faz o WhatsApp identificar como robô.
          </p>
        </div>

        {/* RÉGUA PRÓPRIA PARA QUEM VEIO DE ANÚNCIO */}
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={usaAd}
              onChange={(e) => {
                const v = e.target.checked;
                setUsaAd(v);
                if (v && stepsAd.length === 0)
                  setStepsAd([
                    { delayMinutes: 30 },
                    { delayMinutes: 60 },
                    { delayMinutes: 240 },
                    { delayMinutes: 720 },
                  ]);
                touch();
              }}
              className="mt-0.5 size-3.5 accent-[#8b5cf6]"
            />
            <span>
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Megaphone className="size-3.5 text-muted-2" />
                Tempos diferentes para quem chegou por anúncio
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-2">
                Quem clica num anúncio levantou a mão, e a Meta abre uma janela
                de 72h (contra 24h de quem veio da prospecção). Dá para
                acompanhar por mais tempo.
              </span>
            </span>
          </label>

          {usaAd ? (
            <div className="mt-2.5 space-y-2.5">
              {stepsAd.map((step, i) => (
                <LinhaTempo
                  key={i}
                  step={step}
                  i={i}
                  total={stepsAd.length}
                  onChange={(s) =>
                    mexer(stepsAd, setStepsAd, (prev) =>
                      prev.map((x, idx) => (idx === i ? s : x)),
                    )
                  }
                  onMove={(dir) =>
                    mexer(stepsAd, setStepsAd, (prev) => {
                      const j = i + dir;
                      if (j < 0 || j >= prev.length) return prev;
                      const next = [...prev];
                      [next[i], next[j]] = [next[j], next[i]];
                      return next;
                    })
                  }
                  onRemove={() =>
                    mexer(stepsAd, setStepsAd, (prev) =>
                      prev.filter((_, idx) => idx !== i),
                    )
                  }
                />
              ))}
              <button
                onClick={() =>
                  mexer(stepsAd, setStepsAd, (prev) => [
                    ...prev,
                    { delayMinutes: 60 },
                  ])
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-secondary/40 hover:text-fg"
              >
                <Plus className="size-4" />
                Adicionar tempo
              </button>
            </div>
          ) : null}
        </div>

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
            <span className="inline-flex items-start gap-1 text-xs text-[#f87171]">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {error}
            </span>
          ) : null}
          <span className="ml-auto text-[11px] text-muted-2">
            {enabled
              ? `${steps.length} lembrete${steps.length === 1 ? "" : "s"} · ${rotuloHora(janela.startHour)} às ${rotuloHora(janela.endHour % 24)} · ativo`
              : "Desligado"}
          </span>
        </div>
      </div>
    </Card>
  );
}
