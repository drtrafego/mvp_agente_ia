"use client";

import * as React from "react";
import {
  Megaphone,
  Plus,
  X,
  Trash2,
  Loader2,
  AlertTriangle,
  User,
  LayoutTemplate,
  Clock,
  TriangleAlert,
} from "lucide-react";
import {
  createCampaign,
  deleteCampaign,
  type Campaign,
  type ApprovedTemplate,
} from "@/lib/actions";
import { Card, Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

function fillPreview(body: string, leadName: string, vars: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, num: string) => {
    const n = Number(num);
    if (n === 1) return leadName;
    const v = vars[n - 2];
    return v && v.trim() ? v : `{{${n}}}`;
  });
}

export function CampaignsManager({
  slug,
  campaigns,
  templates,
  sendEnabled,
}: {
  slug: string;
  campaigns: Campaign[];
  templates: ApprovedTemplate[];
  sendEnabled: boolean;
}) {
  const [creating, setCreating] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleDelete(id: string) {
    if (pending) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteCampaign(slug, id);
      setDeletingId(null);
    });
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Salve template + variáveis uma vez e reuse no disparo, sem redigitar.
        </p>
        <button
          onClick={() => setCreating(true)}
          disabled={!sendEnabled}
          title={
            sendEnabled
              ? "Nova campanha"
              : "Este agente não tem número de WhatsApp oficial"
          }
          className="brand-gradient inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" />
          Nova campanha
        </button>
      </div>

      {!sendEnabled ? (
        <p className="mb-4 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-2">
          <TriangleAlert className="size-3.5 shrink-0 text-accent" />
          Este agente não tem número de WhatsApp oficial: campanhas indisponíveis.
        </p>
      ) : null}

      {campaigns.length === 0 ? (
        <div className="animate-fade-up grid place-items-center rounded-2xl border border-dashed border-border glass p-14 text-center shadow-soft">
          <div>
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-accent-2/15 text-[#c4b5fd]">
              <Megaphone className="size-6" />
            </span>
            <p className="font-medium">Nenhuma campanha salva</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Crie uma campanha com o template e as variáveis já preenchidas para
              disparar em massa com um clique.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((c) => (
            <Card
              key={c.id}
              glass
              className="animate-fade-up flex flex-col gap-3 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
                    <Megaphone className="size-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold" title={c.name}>
                      {c.name}
                    </h3>
                    <p className="truncate text-[11px] text-muted-2">
                      {c.templateName} ({c.templateLang})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={pending && deletingId === c.id}
                  aria-label="Excluir campanha"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-destructive/15 hover:text-[#f87171] disabled:opacity-40"
                >
                  {pending && deletingId === c.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </div>

              {c.body ? (
                <p className="whitespace-pre-wrap rounded-xl border border-border bg-surface-2/50 px-3.5 py-3 text-sm leading-relaxed text-muted">
                  {fillPreview(c.body, "[nome do lead]", c.vars)}
                </p>
              ) : null}

              {c.createdAt ? (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-2">
                  <Clock className="size-3" />
                  Criada em {formatDateTime(c.createdAt)}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {creating ? (
        <CreateCampaignModal
          slug={slug}
          templates={templates}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </>
  );
}

function CreateCampaignModal({
  slug,
  templates,
  onClose,
}: {
  slug: string;
  templates: ApprovedTemplate[];
  onClose: () => void;
}) {
  const [name, setName] = React.useState("");
  const [tplName, setTplName] = React.useState(templates[0]?.name ?? "");
  const [shared, setShared] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const tpl = templates.find((t) => t.name === tplName) ?? null;
  const varCount = tpl?.varCount ?? 0;
  const sharedNeeded = Math.max(0, varCount - 1);

  React.useEffect(() => {
    setShared(Array(sharedNeeded).fill(""));
    setError(null);
  }, [tplName, sharedNeeded]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, saving]);

  const missing =
    sharedNeeded > 0 && shared.slice(0, sharedNeeded).some((v) => !v.trim());

  async function salvar() {
    if (!tpl || saving) return;
    if (!name.trim()) {
      setError("Dê um nome à campanha.");
      return;
    }
    if (missing) {
      setError("Preencha todas as variáveis do template.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createCampaign(slug, {
      name: name.trim(),
      templateName: tpl.name,
      lang: tpl.language,
      vars: shared.slice(0, sharedNeeded),
      body: tpl.body,
    });
    setSaving(false);
    if (res.ok) onClose();
    else setError(res.error ?? "Não foi possível salvar.");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => (saving ? null : onClose())}
      />
      <div className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border glass-2 shadow-soft animate-fade-up sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
              <Megaphone className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Nova campanha</h2>
              <p className="text-xs text-muted">
                Template + variáveis salvos para reuso
              </p>
            </div>
          </div>
          <button
            onClick={() => (saving ? null : onClose())}
            disabled={saving}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Nome da campanha
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex.: Reengajamento leads julho"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-fg outline-none placeholder:text-muted-2 focus:border-secondary/50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Template aprovado
            </label>
            {templates.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface-2/60 px-3 py-2.5 text-xs text-muted-2">
                Nenhum template aprovado disponível para este agente.
              </p>
            ) : (
              <div className="relative">
                <LayoutTemplate className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
                <select
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-border bg-surface-2 py-2.5 pl-9 pr-3 text-sm text-fg outline-none focus:border-secondary/50"
                >
                  {templates.map((t) => (
                    <option key={`${t.name}-${t.language}`} value={t.name}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {tpl?.body ? (
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-2">
                Corpo do template
              </p>
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2/50 px-3 py-2.5 text-sm text-muted">
                {tpl.body}
              </p>
            </div>
          ) : null}

          {varCount >= 1 ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-accent-2/30 bg-accent-2/10 px-3 py-2 text-xs text-[#c4b5fd]">
              <User className="size-3.5 shrink-0" />
              <span>
                <strong>{"{{1}}"}</strong> = nome do lead (automático no disparo)
              </span>
            </div>
          ) : null}

          {sharedNeeded > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-2">
                Variáveis (valem para todos os leads)
              </p>
              {Array.from({ length: sharedNeeded }).map((_, idx) => (
                <div key={idx}>
                  <label className="mb-1 block text-xs font-medium text-muted">
                    Variável {idx + 2} {`{{${idx + 2}}}`}
                  </label>
                  <input
                    value={shared[idx] ?? ""}
                    onChange={(e) =>
                      setShared((prev) => {
                        const next = [...prev];
                        next[idx] = e.target.value;
                        return next;
                      })
                    }
                    placeholder={`Conteúdo da variável ${idx + 2}`}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-fg outline-none placeholder:text-muted-2 focus:border-secondary/50"
                  />
                </div>
              ))}
            </div>
          ) : null}

          {tpl?.body && varCount >= 1 ? (
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-2">
                Prévia
              </p>
              <p className="whitespace-pre-wrap rounded-lg border border-secondary/25 bg-gradient-to-br from-secondary/15 to-accent-2/10 px-3 py-2.5 text-sm text-fg">
                {fillPreview(tpl.body, "[nome do lead]", shared)}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="flex items-center gap-1.5 text-xs text-[#f87171]">
              <AlertTriangle className="size-3.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>

        <div className="border-t border-border p-4">
          <button
            onClick={salvar}
            disabled={saving || !tpl || !name.trim() || missing}
            className="brand-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Salvando…
              </>
            ) : (
              <>
                <Plus className="size-4" />
                Salvar campanha
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
