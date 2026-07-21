"use client";

import * as React from "react";
import {
  CalendarClock,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  TriangleAlert,
  Save,
  Webhook,
  Sun,
  Sunset,
} from "lucide-react";
import { saveAgendaConfig, type AgendaConfig, type AgendaRange } from "@/lib/actions";
import { Card } from "@/components/ui";

// Ordem de exibição: começa na segunda. Chave "0"=domingo .. "6"=sábado.
const DAYS: { key: string; label: string; short: string }[] = [
  { key: "1", label: "Segunda", short: "Seg" },
  { key: "2", label: "Terça", short: "Ter" },
  { key: "3", label: "Quarta", short: "Qua" },
  { key: "4", label: "Quinta", short: "Qui" },
  { key: "5", label: "Sexta", short: "Sex" },
  { key: "6", label: "Sábado", short: "Sáb" },
  { key: "0", label: "Domingo", short: "Dom" },
];

const SLOT_OPTIONS = [15, 20, 30, 45, 60];
const MANHA: AgendaRange = ["08:00", "12:00"];
const TARDE: AgendaRange = ["14:00", "18:00"];

function cloneHours(h: Record<string, AgendaRange[]>): Record<string, AgendaRange[]> {
  const out: Record<string, AgendaRange[]> = {};
  for (const d of DAYS) out[d.key] = (h[d.key] ?? []).map((r) => [r[0], r[1]] as AgendaRange);
  return out;
}

export function HorariosCard({
  slug,
  config,
  supported,
}: {
  slug: string;
  config: AgendaConfig;
  supported: boolean;
}) {
  const [hours, setHours] = React.useState<Record<string, AgendaRange[]>>(
    cloneHours(config.hours),
  );
  const [slotMinutes, setSlotMinutes] = React.useState(config.slotMinutes);
  const [webhookUrl, setWebhookUrl] = React.useState(config.webhook.url);
  const [webhookEnabled, setWebhookEnabled] = React.useState(config.webhook.enabled);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [okMsg, setOkMsg] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  function touch() {
    setDirty(true);
    setOkMsg(null);
    setError(null);
  }

  function toggleDay(key: string) {
    setHours((prev) => {
      const next = cloneHours(prev);
      next[key] = next[key].length ? [] : [[...MANHA] as AgendaRange];
      return next;
    });
    touch();
  }
  function addRange(key: string, preset?: AgendaRange) {
    setHours((prev) => {
      const next = cloneHours(prev);
      next[key] = [...next[key], preset ? ([...preset] as AgendaRange) : (["08:00", "12:00"] as AgendaRange)];
      return next;
    });
    touch();
  }
  function removeRange(key: string, i: number) {
    setHours((prev) => {
      const next = cloneHours(prev);
      next[key] = next[key].filter((_, idx) => idx !== i);
      return next;
    });
    touch();
  }
  function setRange(key: string, i: number, pos: 0 | 1, value: string) {
    setHours((prev) => {
      const next = cloneHours(prev);
      const r = [...next[key][i]] as AgendaRange;
      r[pos] = value;
      next[key][i] = r;
      return next;
    });
    touch();
  }

  async function save() {
    if (saving) return;
    // Validação leve no cliente: início < fim em toda faixa ativa.
    for (const d of DAYS) {
      for (const r of hours[d.key]) {
        if (r[0] >= r[1]) {
          setError(`Em ${d.label}, o horário final tem que ser depois do inicial.`);
          return;
        }
      }
    }
    if (webhookEnabled && !/^https?:\/\//.test(webhookUrl.trim())) {
      setError("A URL do webhook precisa começar com http:// ou https://.");
      return;
    }
    setSaving(true);
    setError(null);
    setOkMsg(null);
    const payload: AgendaConfig = {
      timezone: config.timezone,
      slotMinutes,
      hours,
      webhook: { enabled: webhookEnabled, url: webhookUrl.trim() },
    };
    const res = await saveAgendaConfig(slug, payload);
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      setOkMsg("Salvo. O bot já passa a oferecer esses horários.");
      setTimeout(() => setOkMsg(null), 3000);
    } else {
      setError(res.error ?? "Falha ao salvar.");
    }
  }

  const activeDays = DAYS.filter((d) => hours[d.key].length).length;

  return (
    <div className="space-y-5">
      {/* ---- Horários por dia ---- */}
      <Card glass className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
            <CalendarClock className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">Horários de atendimento</h3>
            <p className="mt-0.5 max-w-xl text-xs text-muted">
              Defina os dias e as faixas de horário em que o bot pode marcar
              consultas. Ele só oferece horários dentro dessas faixas e que
              estejam livres na agenda. Fora daqui, nada é oferecido.
            </p>
          </div>
        </div>

        {!supported ? (
          <p className="mt-4 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-2">
            <TriangleAlert className="size-3.5 shrink-0 text-accent" />
            Este agente não tem agenda configurada.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-2">
                Duração da consulta
              </span>
              <select
                value={slotMinutes}
                onChange={(e) => {
                  setSlotMinutes(Number(e.target.value));
                  touch();
                }}
                className="appearance-none rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50"
              >
                {SLOT_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
              <span className="ml-auto text-[11px] text-muted-2">
                {activeDays} dia{activeDays === 1 ? "" : "s"} com atendimento
              </span>
            </div>

            <div className="mt-3 space-y-2.5">
              {DAYS.map((d) => {
                const ranges = hours[d.key];
                const on = ranges.length > 0;
                return (
                  <div
                    key={d.key}
                    className="rounded-xl border border-border bg-surface-2/40 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleDay(d.key)}
                        aria-pressed={on}
                        aria-label={`${on ? "Desligar" : "Ligar"} ${d.label}`}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                          on ? "brand-gradient" : "bg-surface-3"
                        }`}
                      >
                        <span
                          className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
                            on ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                      <span
                        className={`w-20 text-sm font-medium ${on ? "text-fg" : "text-muted-2"}`}
                      >
                        {d.label}
                      </span>
                      {on ? (
                        <div className="ml-auto flex items-center gap-1.5">
                          <button
                            onClick={() => addRange(d.key, MANHA)}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-secondary/40 hover:text-fg"
                          >
                            <Sun className="size-3" /> Manhã
                          </button>
                          <button
                            onClick={() => addRange(d.key, TARDE)}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-secondary/40 hover:text-fg"
                          >
                            <Sunset className="size-3" /> Tarde
                          </button>
                        </div>
                      ) : (
                        <span className="ml-auto text-[11px] text-muted-2">
                          Sem atendimento
                        </span>
                      )}
                    </div>

                    {on ? (
                      <div className="mt-2.5 space-y-2 pl-14">
                        {ranges.map((r, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2">
                            <input
                              type="time"
                              value={r[0]}
                              onChange={(e) => setRange(d.key, i, 0, e.target.value)}
                              className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50 [color-scheme:dark]"
                            />
                            <span className="text-xs text-muted-2">até</span>
                            <input
                              type="time"
                              value={r[1]}
                              onChange={(e) => setRange(d.key, i, 1, e.target.value)}
                              className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-secondary/50 [color-scheme:dark]"
                            />
                            <button
                              onClick={() => removeRange(d.key, i)}
                              aria-label="Remover faixa"
                              className="grid size-7 place-items-center rounded-md text-muted-2 hover:bg-destructive/15 hover:text-[#f87171]"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addRange(d.key)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-secondary/40 hover:text-fg"
                        >
                          <Plus className="size-3.5" />
                          Adicionar faixa
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* ---- Webhook do CRM ---- */}
      <Card glass className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
              <Webhook className="size-5" />
            </span>
            <div>
              <h3 className="font-semibold">Webhook do CRM</h3>
              <p className="mt-0.5 max-w-lg text-xs text-muted">
                Quando o bot marca uma consulta, ele avisa o seu CRM enviando os
                dados do paciente (nome, telefone, email, data e hora) pra esta
                URL. Deixe desligado se ainda não tiver o endereço.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setWebhookEnabled((v) => !v);
              touch();
            }}
            disabled={!supported}
            aria-pressed={webhookEnabled}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              webhookEnabled ? "brand-gradient" : "bg-surface-3"
            }`}
          >
            <span
              className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
                webhookEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted-2">
            URL do webhook
          </label>
          <input
            type="url"
            inputMode="url"
            placeholder="https://seu-crm.com/webhook/agendamento"
            value={webhookUrl}
            onChange={(e) => {
              setWebhookUrl(e.target.value);
              touch();
            }}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-secondary/50"
          />
        </div>
      </Card>

      {/* ---- Ações ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !dirty || !supported}
          className="brand-gradient inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Salvar horários
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
      </div>
    </div>
  );
}
