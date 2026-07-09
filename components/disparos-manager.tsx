"use client";

import * as React from "react";
import {
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  Loader2,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  cancelScheduledDispatch,
  setAutoRecovery,
  type ScheduledDispatch,
  type AutoRecovery,
  type Campaign,
} from "@/lib/actions";
import { Card, Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export function DisparosManager({
  slug,
  dispatches,
  autoRecovery,
  campaigns,
  autoSupported,
}: {
  slug: string;
  dispatches: ScheduledDispatch[];
  autoRecovery: AutoRecovery;
  campaigns: Campaign[];
  autoSupported: boolean;
}) {
  const selected = dispatches.filter((d) => d.kind === "selected");
  const campaignName = (id: string | null) =>
    id ? (campaigns.find((c) => c.id === id)?.name ?? id) : null;

  return (
    <div className="space-y-5">
      <AutoRecoveryCard
        slug={slug}
        autoRecovery={autoRecovery}
        campaigns={campaigns}
        supported={autoSupported}
      />

      <Card glass className="overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Disparos programados</h3>
          <p className="text-xs text-muted">
            Envios imediatos (na fila) e agendados
          </p>
        </div>

        {selected.length === 0 ? (
          <div className="grid place-items-center p-12 text-center">
            <div>
              <Send className="mx-auto mb-3 size-8 text-muted-2" />
              <p className="font-medium">Nenhum disparo programado</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Selecione leads na página Leads e use{" "}
                <strong className="font-medium text-fg">
                  Programar disparo
                </strong>{" "}
                para agendar ou enviar agora.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {selected.map((d) => (
              <DispatchRow
                key={d.id}
                slug={slug}
                dispatch={d}
                campaignName={campaignName(d.campaignId)}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function DispatchRow({
  slug,
  dispatch: d,
  campaignName,
}: {
  slug: string;
  dispatch: ScheduledDispatch;
  campaignName: string | null;
}) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const title = campaignName ?? `Template: ${d.templateName || "—"}`;
  const scheduledMs = d.scheduledAt ? new Date(d.scheduledAt).getTime() : 0;
  const isQueued = d.status === "pending" && scheduledMs <= Date.now();

  function cancel() {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await cancelScheduledDispatch(slug, d.id);
      if (!res.ok) setError(res.error ?? "Falha ao cancelar.");
    });
  }

  return (
    <li className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-2">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" />
            {d.targetPhones.length} alvo
            {d.targetPhones.length === 1 ? "" : "s"}
          </span>
          {d.status === "done" && d.ranAt ? (
            <span>Enviado em {formatDateTime(d.ranAt)}</span>
          ) : d.scheduledAt ? (
            <span>
              {isQueued ? "Na fila desde" : "Agendado para"}{" "}
              {formatDateTime(d.scheduledAt)}
            </span>
          ) : null}
          {d.result ? <span className="text-muted">· {d.result}</span> : null}
        </div>
        {error ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-[#f87171]">
            <TriangleAlert className="size-3" />
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={d.status} queued={isQueued} />
        {d.status === "pending" ? (
          <button
            onClick={cancel}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-destructive/40 hover:text-[#f87171] disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Ban className="size-3.5" />
            )}
            Cancelar
          </button>
        ) : null}
      </div>
    </li>
  );
}

function StatusBadge({ status, queued }: { status: string; queued: boolean }) {
  if (status === "done")
    return (
      <Badge tone="success">
        <CheckCircle2 className="size-3" />
        Enviado
      </Badge>
    );
  if (status === "canceled")
    return (
      <Badge tone="neutral">
        <Ban className="size-3" />
        Cancelado
      </Badge>
    );
  if (status === "error")
    return (
      <Badge tone="destructive">
        <XCircle className="size-3" />
        Erro
      </Badge>
    );
  return (
    <Badge tone="accent">
      <Clock className="size-3" />
      {queued ? "Na fila" : "Agendado"}
    </Badge>
  );
}

function AutoRecoveryCard({
  slug,
  autoRecovery,
  campaigns,
  supported,
}: {
  slug: string;
  autoRecovery: AutoRecovery;
  campaigns: Campaign[];
  supported: boolean;
}) {
  const defaultCampaign =
    autoRecovery?.campaignId ??
    campaigns.find((c) => c.id.endsWith("recuperacao-cadastro"))?.id ??
    campaigns[0]?.id ??
    "";

  const [enabled, setEnabled] = React.useState(!!autoRecovery?.enabled);
  const [campaignId, setCampaignId] = React.useState(defaultCampaign);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function persist(nextEnabled: boolean, nextCampaign: string) {
    setError(null);
    start(async () => {
      const res = await setAutoRecovery(slug, {
        enabled: nextEnabled,
        campaignId: nextCampaign,
      });
      if (!res.ok) {
        setError(res.error ?? "Falha ao salvar.");
        setEnabled(!!autoRecovery?.enabled);
      }
    });
  }

  function toggle() {
    if (pending || !supported) return;
    const next = !enabled;
    setEnabled(next);
    persist(next, campaignId);
  }

  function onCampaign(id: string) {
    setCampaignId(id);
    if (enabled) persist(true, id);
  }

  return (
    <Card
      glass
      className="p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">Auto-recuperação</h3>
            <p className="mt-0.5 max-w-md text-xs text-muted">
              Quando ligado, todo lead que se cadastrou e não mandou mensagem
              recebe a campanha automaticamente (uma vez só), a cada execução do
              robô.
            </p>
          </div>
        </div>

        <button
          onClick={toggle}
          disabled={pending || !supported}
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

      {supported ? (
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Campanha da auto-recuperação
          </label>
          {campaigns.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-2/60 px-3 py-2.5 text-xs text-muted-2">
              Crie uma campanha primeiro (página Campanhas) para ligar a
              auto-recuperação.
            </p>
          ) : (
            <select
              value={campaignId}
              onChange={(e) => onCampaign(e.target.value)}
              disabled={pending}
              className="w-full max-w-md appearance-none rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-fg outline-none focus:border-secondary/50 sm:w-auto"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <div className="mt-2 flex items-center gap-2 text-xs">
            {enabled ? (
              <span className="inline-flex items-center gap-1 text-[#4ade80]">
                <CheckCircle2 className="size-3.5" /> Ativa
              </span>
            ) : (
              <span className="text-muted-2">Desligada</span>
            )}
            {pending ? (
              <Loader2 className="size-3.5 animate-spin text-muted-2" />
            ) : null}
          </div>
          {error ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-[#f87171]">
              <TriangleAlert className="size-3.5" />
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-2">
          <TriangleAlert className="size-3.5 shrink-0 text-accent" />
          Disponível para agentes com leads de formulário Meta.
        </p>
      )}
    </Card>
  );
}
