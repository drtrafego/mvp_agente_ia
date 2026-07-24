"use client";

import * as React from "react";
import {
  Megaphone,
  Plus,
  X,
  Pencil,
  Trash2,
  Save,
  Loader2,
  AlertTriangle,
  User,
  LayoutTemplate,
  Clock,
  TriangleAlert,
} from "lucide-react";
import {
  createCampaign,
  updateCampaign,
  deleteCampaign,
  type Campaign,
  type ApprovedTemplate,
} from "@/lib/actions";
import { Card, Badge } from "@/components/ui";
import { ModalPortal } from "@/components/modal-portal";
import { formatDateTime, expandCampaignVars } from "@/lib/utils";

// Preview: substitui {{n}} pelo valor da variável n e, dentro dele, o token
// {nome} pelo nome de exemplo. Espera `vars` como lista posicional {{1}}..{{N}}.
function fillPreview(body: string, sampleName: string, vars: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, num: string) => {
    const v = vars[Number(num) - 1];
    if (v == null) return `{{${num}}}`;
    const filled = v.replace(/\{\{?\s*nome\s*\}?\}/gi, sampleName);
    return filled.trim() ? filled : `{{${num}}}`;
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
  const [modal, setModal] = React.useState<
    { mode: "create" } | { mode: "edit"; campaign: Campaign } | null
  >(null);
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Salve template + variáveis uma vez e reuse no disparo, sem redigitar.
        </p>
        <button
          onClick={() => setModal({ mode: "create" })}
          disabled={!sendEnabled}
          title={
            sendEnabled
              ? "Nova campanha"
              : "Este agente não tem número de WhatsApp oficial"
          }
          className="brand-gradient inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setModal({ mode: "edit", campaign: c })}
                    disabled={!sendEnabled}
                    aria-label="Editar campanha"
                    title="Editar"
                    className="grid size-8 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={pending && deletingId === c.id}
                    aria-label="Excluir campanha"
                    title="Excluir"
                    className="grid size-8 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-destructive/15 hover:text-[#f87171] disabled:opacity-40"
                  >
                    {pending && deletingId === c.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {c.body ? (
                <p className="whitespace-pre-wrap rounded-xl border border-border bg-surface-2/50 px-3.5 py-3 text-sm leading-relaxed text-muted">
                  {fillPreview(
                    c.body,
                    "[nome do lead]",
                    expandCampaignVars(c.vars, c.varCount),
                  )}
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

      {modal ? (
        <CampaignFormModal
          slug={slug}
          templates={templates}
          mode={modal.mode}
          campaign={modal.mode === "edit" ? modal.campaign : null}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}

// Semeia as N posições ({{1}}..{{N}}) ao abrir uma campanha para edição.
// Campanha nova (formato novo) já traz as N posições; campanha antiga trazia
// só {{2}}..{{N}}, então o {{1}} é reconstruído como o token {nome}.
function seedVars(
  campaign: Campaign,
  templates: ApprovedTemplate[],
): string[] {
  const tpl = templates.find((t) => t.name === campaign.templateName);
  const varCount = tpl?.varCount ?? campaign.varCount;
  return expandCampaignVars(campaign.vars, varCount);
}

// Valor padrão das N posições ao criar/trocar template: {{1}} = {nome}
// (mantém o comportamento antigo por default), demais vazias.
function defaultVars(varCount: number): string[] {
  if (varCount <= 0) return [];
  return Array.from({ length: varCount }, (_, i) => (i === 0 ? "{nome}" : ""));
}

function CampaignFormModal({
  slug,
  templates,
  mode,
  campaign,
  onClose,
}: {
  slug: string;
  templates: ApprovedTemplate[];
  mode: "create" | "edit";
  campaign: Campaign | null;
  onClose: () => void;
}) {
  const isEdit = mode === "edit" && campaign !== null;

  const [name, setName] = React.useState(isEdit ? campaign!.name : "");
  const initialTplName = isEdit
    ? campaign!.templateName
    : (templates[0]?.name ?? "");
  const [tplName, setTplName] = React.useState(initialTplName);
  const [vars, setVars] = React.useState<string[]>(() => {
    if (isEdit) return seedVars(campaign!, templates);
    const initialTpl = templates.find((t) => t.name === initialTplName);
    return defaultVars(initialTpl?.varCount ?? 0);
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const tpl = templates.find((t) => t.name === tplName) ?? null;
  const varCount = tpl?.varCount ?? 0;

  // Só reseta as variáveis quando o template REALMENTE muda (não no mount,
  // para preservar os valores já preenchidos ao editar).
  const prevTpl = React.useRef(tplName);
  React.useEffect(() => {
    if (prevTpl.current !== tplName) {
      prevTpl.current = tplName;
      setVars(defaultVars(varCount));
    }
    setError(null);
  }, [tplName, varCount]);

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

  async function salvar() {
    if (!tpl || saving) return;
    if (!name.trim()) {
      setError("Dê um nome à campanha.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      templateName: tpl.name,
      lang: tpl.language,
      vars: vars.slice(0, varCount).map((v) => v ?? ""),
      varCount,
      body: tpl.body,
    };
    const res = isEdit
      ? await updateCampaign(slug, campaign!.id, payload)
      : await createCampaign(slug, payload);
    setSaving(false);
    if (res.ok) onClose();
    else setError(res.error ?? "Não foi possível salvar.");
  }

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => (saving ? null : onClose())}
      />
      <div className="relative flex max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border glass-2 shadow-soft animate-fade-up sm:max-h-[90dvh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
              <Megaphone className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">
                {isEdit ? "Editar campanha" : "Nova campanha"}
              </h2>
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
            <div className="flex items-start gap-1.5 rounded-lg border border-accent-2/30 bg-accent-2/10 px-3 py-2 text-xs text-[#c4b5fd]">
              <User className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Digite um valor fixo em cada variável OU escreva{" "}
                <strong>{"{nome}"}</strong> para preencher com o nome do lead
                automaticamente no disparo.
              </span>
            </div>
          ) : null}

          {varCount >= 1 ? (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-2">
                Variáveis do template
              </p>
              {Array.from({ length: varCount }).map((_, idx) => (
                <div key={idx}>
                  <label className="mb-1 block text-xs font-medium text-muted">
                    Variável {idx + 1} {`{{${idx + 1}}}`}
                  </label>
                  <input
                    value={vars[idx] ?? ""}
                    onChange={(e) =>
                      setVars((prev) => {
                        const next = [...prev];
                        while (next.length < varCount) next.push("");
                        next[idx] = e.target.value;
                        return next;
                      })
                    }
                    placeholder="valor fixo ou {nome}"
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
                {fillPreview(tpl.body, "[nome do lead]", vars)}
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
            disabled={saving || !tpl || !name.trim()}
            className="brand-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Salvando…
              </>
            ) : isEdit ? (
              <>
                <Save className="size-4" />
                Salvar alterações
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
    </ModalPortal>
  );
}
