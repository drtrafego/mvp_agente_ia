"use client";

import * as React from "react";
import { Check, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { Card, Button } from "@/components/ui";
import { saveAgentSettings, type AgentSettingsInput } from "@/lib/agent-settings";

export type AgentSettingsView = AgentSettingsInput & {
  slug: string;
  schema: string;
  orgName: string;
  hasToken: boolean;
  tokenEnv: string | null;
};

const ACCENTS = [
  { value: "primary", label: "Azul" },
  { value: "secondary", label: "Índigo" },
  { value: "accent", label: "Violeta" },
];

const SOURCES = [
  { value: "none", label: "Nenhuma" },
  { value: "form", label: "Formulário da Meta" },
  { value: "outreach", label: "Prospecção" },
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-muted-2">{hint}</span> : null}
    </label>
  );
}

const INPUT =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-muted-2 focus:border-secondary/60";

export function AgentSettingsForm({
  initial,
  canEdit,
}: {
  initial: AgentSettingsView;
  canEdit: boolean;
}) {
  const [form, setForm] = React.useState<AgentSettingsInput>({
    name: initial.name,
    persona: initial.persona,
    description: initial.description,
    accent: initial.accent,
    metaPhoneNumberId: initial.metaPhoneNumberId,
    metaWabaId: initial.metaWabaId,
    leadSource: initial.leadSource,
    leadSourcePageId: initial.leadSourcePageId,
    metaToken: "",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [okMsg, setOkMsg] = React.useState<string | null>(null);

  function set<K extends keyof AgentSettingsInput>(key: K, value: AgentSettingsInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setOkMsg(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    const res = await saveAgentSettings(initial.slug, form);
    setSaving(false);
    if (res.ok) {
      setOkMsg("Configuração salva.");
      setForm((f) => ({ ...f, metaToken: "" }));
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {!canEdit ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" />
          <p>
            Você está vendo a configuração deste agente em modo leitura. Alterações
            são feitas pelo administrador.
          </p>
        </div>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">Identificação</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do agente">
            <input
              className={INPUT}
              value={form.name}
              disabled={!canEdit}
              onChange={(e) => set("name", e.target.value)}
              maxLength={60}
              required
            />
          </Field>
          <Field label="Persona" hint="Nome que o bot usa ao se apresentar.">
            <input
              className={INPUT}
              value={form.persona}
              disabled={!canEdit}
              onChange={(e) => set("persona", e.target.value)}
              maxLength={40}
            />
          </Field>
          <Field label="Descrição">
            <input
              className={INPUT}
              value={form.description}
              disabled={!canEdit}
              onChange={(e) => set("description", e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Cor de destaque">
            <select
              className={INPUT}
              value={form.accent}
              disabled={!canEdit}
              onChange={(e) => set("accent", e.target.value)}
            >
              {ACCENTS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold">WhatsApp da Meta</h2>
        <p className="mb-4 text-xs text-muted-2">
          Sem estes dados o painel não envia mensagem nem template por este agente.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number id">
            <input
              className={INPUT}
              value={form.metaPhoneNumberId}
              disabled={!canEdit}
              onChange={(e) => set("metaPhoneNumberId", e.target.value)}
              inputMode="numeric"
              placeholder="115216611574100"
            />
          </Field>
          <Field label="WABA id">
            <input
              className={INPUT}
              value={form.metaWabaId}
              disabled={!canEdit}
              onChange={(e) => set("metaWabaId", e.target.value)}
              inputMode="numeric"
              placeholder="106071169159774"
            />
          </Field>
          <Field
            label="Token da Meta"
            hint={
              initial.hasToken
                ? "Token próprio configurado. Preencha apenas para substituir."
                : initial.tokenEnv
                  ? `Hoje usa a variável ${initial.tokenEnv}. Preencha para gravar um token próprio.`
                  : "Hoje usa o token padrão do sistema. Preencha para gravar um token próprio."
            }
          >
            <input
              className={INPUT}
              type="password"
              value={form.metaToken}
              disabled={!canEdit}
              onChange={(e) => set("metaToken", e.target.value)}
              autoComplete="new-password"
              placeholder="deixe em branco para manter"
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold">Fonte de leads</h2>
        <p className="mb-4 text-xs text-muted-2">
          Define de onde vêm os leads da aba Leads. Errar aqui mistura dado de
          origem diferente na mesma tela.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Origem">
            <select
              className={INPUT}
              value={form.leadSource}
              disabled={!canEdit}
              onChange={(e) => set("leadSource", e.target.value)}
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          {form.leadSource === "form" ? (
            <Field label="Id da página" hint="Página da Meta dona do formulário.">
              <input
                className={INPUT}
                value={form.leadSourcePageId}
                disabled={!canEdit}
                onChange={(e) => set("leadSourcePageId", e.target.value)}
                inputMode="numeric"
                placeholder="109902140539351"
              />
            </Field>
          ) : null}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">Vínculos fixos</h2>
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <div className="text-muted-2">Empresa</div>
            <div className="mt-0.5 font-medium">{initial.orgName}</div>
          </div>
          <div>
            <div className="text-muted-2">Identificador</div>
            <div className="mt-0.5 font-medium tnum">{initial.slug}</div>
          </div>
          <div>
            <div className="text-muted-2">Schema no banco</div>
            <div className="mt-0.5 font-medium tnum">{initial.schema}</div>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-2">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          Identificador e schema não mudam depois de criados: é onde as conversas
          deste agente estão gravadas e para onde o motor no servidor aponta.
        </p>
      </Card>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-[#fca5a5]">
          {error}
        </p>
      ) : null}
      {okMsg ? (
        <p className="flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-[#4ade80]">
          <Check className="size-3.5" /> {okMsg}
        </p>
      ) : null}

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Salvando
              </>
            ) : (
              "Salvar configuração"
            )}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
