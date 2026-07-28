"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, Trash2, Loader2, Copy, Check } from "lucide-react";
import type { KanbanLead } from "@/lib/kanban";
import { updateLead, deleteLead } from "@/lib/kanban-actions";

// Modal de detalhe/edição do lead: abre no meio da tela ao clicar num card.
// Todos os campos são editáveis; dá pra salvar, copiar contato e excluir.
export function LeadModal({
  slug,
  lead,
  onClose,
}: {
  slug: string;
  lead: KanbanLead;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(lead.name);
  const [phone, setPhone] = React.useState(lead.phone ?? "");
  const [email, setEmail] = React.useState(lead.email ?? "");
  const [source, setSource] = React.useState(lead.campaignSource ?? "");
  const [notes, setNotes] = React.useState(lead.notes ?? "");
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);

  // Fecha no Esc.
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await updateLead(slug, lead.id, {
        name,
        phone,
        email,
        campaignSource: source,
        notes,
      });
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteLead(slug, lead.id);
      onClose();
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="animate-fade-up relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-fg">
              {name || "Lead"}
            </h2>
            <p className="text-xs text-muted">
              Criado em {new Date(lead.createdAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <Field label="Nome">
            <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telefone (WhatsApp)" copy={phone}>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className={INPUT}
              />
            </Field>
            <Field label="Email" copy={email}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Origem">
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="ex.: Anúncio, Indicação, Direto"
              className={INPUT}
            />
          </Field>

          <Field label="Observações">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Anotações sobre o paciente, histórico, etc."
              className={`${INPUT} resize-y`}
            />
          </Field>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          {confirmDel ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted">Excluir mesmo?</span>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="inline-flex items-center gap-1 rounded-lg bg-destructive/15 px-2.5 py-1.5 font-medium text-destructive hover:bg-destructive/25 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Sim, excluir
              </button>
              <button
                type="button"
                onClick={() => setConfirmDel(false)}
                className="rounded-lg px-2.5 py-1.5 text-muted hover:bg-surface-2"
              >
                Não
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              Excluir
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none placeholder:text-muted-2 focus:border-secondary/50";

function Field({
  label,
  copy,
  children,
}: {
  label: string;
  copy?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-muted">{label}</label>
        {copy && copy.trim() ? <CopyBtn value={copy} /> : null}
      </div>
      {children}
    </div>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex items-center gap-1 text-[11px] text-muted-2 hover:text-fg"
    >
      {done ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
      {done ? "copiado" : "copiar"}
    </button>
  );
}
