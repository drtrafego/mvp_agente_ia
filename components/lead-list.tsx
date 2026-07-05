"use client";

import * as React from "react";
import Link from "next/link";
import {
  X,
  Phone,
  Mail,
  Megaphone,
  Layers,
  Image as ImageIcon,
  Radio,
  User,
  Users,
  MessageCircle,
  ArrowRight,
  Clock,
  CheckCircle2,
  ClipboardList,
  Rocket,
  Send,
  LayoutTemplate,
  Loader2,
  AlertTriangle,
  TriangleAlert,
} from "lucide-react";
import type { FormLead } from "@/lib/queries";
import {
  sendTemplateToLeads,
  dispatchCampaign,
  type ApprovedTemplate,
  type OutreachSummary,
  type Campaign,
} from "@/lib/actions";
import { Badge } from "./ui";
import { formatDate, formatDateTime } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  full_name: "Nome",
  first_name: "Nome",
  last_name: "Sobrenome",
  nome: "Nome",
  phone: "Telefone",
  phone_number: "Telefone",
  telefone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  "e-mail": "E-mail",
  city: "Cidade",
  state: "Estado",
  company_name: "Empresa",
  job_title: "Cargo",
};

const HIDDEN_FIELDS = new Set([
  "full_name",
  "first_name",
  "last_name",
  "name",
  "nome",
  "phone",
  "phone_number",
  "telefone",
  "whatsapp",
  "email",
  "e-mail",
]);

function fieldLabel(name: string): string {
  const key = name.toLowerCase().trim();
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return name
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LeadList({
  slug,
  leads,
  templates,
  campaigns,
  sendEnabled,
}: {
  slug: string;
  leads: FormLead[];
  templates: ApprovedTemplate[];
  campaigns: Campaign[];
  sendEnabled: boolean;
}) {
  const [detail, setDetail] = React.useState<FormLead | null>(null);
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [campaignOpen, setCampaignOpen] = React.useState(false);

  const aguardando = React.useMemo(
    () => leads.filter((l) => !l.conversou && l.phone_norm),
    [leads],
  );
  const allAguardandoSelected =
    aguardando.length > 0 && aguardando.every((l) => sel.has(l.phone_norm!));

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllAguardando() {
    setSel((prev) => {
      const next = new Set(prev);
      if (allAguardandoSelected) {
        aguardando.forEach((l) => next.delete(l.phone_norm!));
      } else {
        aguardando.forEach((l) => next.add(l.phone_norm!));
      }
      return next;
    });
  }

  const targets = React.useMemo(
    () =>
      leads
        .filter((l) => l.phone_norm && sel.has(l.phone_norm))
        .map((l) => ({ phone: l.phone_norm as string, name: l.full_name ?? "" })),
    [leads, sel],
  );

  return (
    <>
      {/* Toolbar de disparo */}
      {sel.size > 0 ? (
        <div className="animate-fade-up mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-secondary/30 bg-gradient-to-r from-secondary/10 to-accent-2/10 px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-secondary" />
            <span className="font-medium">{sel.size}</span> selecionado
            {sel.size > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSel(new Set())}
              className="rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-fg"
            >
              Limpar
            </button>
            <button
              onClick={() => setCampaignOpen(true)}
              disabled={!sendEnabled}
              title={
                sendEnabled
                  ? "Disparar template"
                  : "Este agente não tem número de WhatsApp oficial"
              }
              className="brand-gradient inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Rocket className="size-4" />
              Disparar template
            </button>
          </div>
        </div>
      ) : null}

      {!sendEnabled ? (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-2">
          <TriangleAlert className="size-3.5 shrink-0 text-accent" />
          Este agente não tem número de WhatsApp oficial: o disparo de template
          está indisponível.
        </p>
      ) : null}

      <div className="animate-fade-up overflow-hidden rounded-2xl border border-border glass shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os Aguardando"
                    checked={allAguardandoSelected}
                    onChange={toggleAllAguardando}
                    disabled={aguardando.length === 0}
                    className="size-4 accent-[#8b5cf6]"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Campanha
                </th>
                <th className="hidden px-4 py-3 font-medium xl:table-cell">
                  Anúncio
                </th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">
                  Data
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  Disparo
                </th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, i) => {
                const id = lead.phone_norm;
                const checked = id ? sel.has(id) : false;
                return (
                  <tr
                    key={lead.lead_id ?? `${lead.phone_norm}-${i}`}
                    onClick={() => setDetail(lead)}
                    className={`cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2 ${
                      checked ? "bg-secondary/10" : ""
                    }`}
                  >
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${lead.full_name ?? "lead"}`}
                        checked={checked}
                        disabled={!id}
                        onChange={() => id && toggle(id)}
                        className="size-4 accent-[#8b5cf6] disabled:opacity-30"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-2/15 text-[#c4b5fd]">
                          <User className="size-3.5" />
                        </span>
                        <span className="truncate font-medium">
                          {lead.full_name ?? "Sem nome"}
                        </span>
                      </div>
                    </td>
                    <td className="tnum px-4 py-3 text-muted">
                      {lead.phone ?? "—"}
                    </td>
                    <td className="hidden max-w-[200px] truncate px-4 py-3 text-muted md:table-cell">
                      {lead.campaign_name ?? "—"}
                    </td>
                    <td className="hidden max-w-[200px] truncate px-4 py-3 text-muted xl:table-cell">
                      {lead.ad_name ?? "—"}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted lg:table-cell">
                      {lead.created_time ? formatDate(lead.created_time) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {lead.conversou ? (
                        <Badge tone="success">
                          <CheckCircle2 className="size-3" />
                          Conversou
                        </Badge>
                      ) : (
                        <Badge tone="accent">
                          <Clock className="size-3" />
                          Aguardando
                        </Badge>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {lead.templateEnviado ? (
                        <Badge
                          tone="violet"
                          title={
                            lead.ultimoTemplate
                              ? `${lead.ultimoTemplate}${
                                  lead.enviadoEm
                                    ? ` · ${formatDate(lead.enviadoEm)}`
                                    : ""
                                }`
                              : undefined
                          }
                        >
                          <Send className="size-3" />
                          {lead.enviadoEm ? formatDate(lead.enviadoEm) : "Enviado"}
                        </Badge>
                      ) : (
                        <span className="text-muted-2">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detail ? (
        <LeadModal slug={slug} lead={detail} onClose={() => setDetail(null)} />
      ) : null}

      {campaignOpen ? (
        <CampaignModal
          slug={slug}
          templates={templates}
          campaigns={campaigns}
          targets={targets}
          onClose={() => setCampaignOpen(false)}
          onDone={() => {
            setCampaignOpen(false);
            setSel(new Set());
          }}
        />
      ) : null}
    </>
  );
}

function fillPreview(
  body: string,
  leadName: string,
  sharedParams: string[],
): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, num: string) => {
    const n = Number(num);
    if (n === 1) return leadName || "{{1}}";
    const v = sharedParams[n - 2];
    return v && v.trim() ? v : `{{${n}}}`;
  });
}

function CampaignModal({
  slug,
  templates,
  campaigns,
  targets,
  onClose,
  onDone,
}: {
  slug: string;
  templates: ApprovedTemplate[];
  campaigns: Campaign[];
  targets: { phone: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = React.useState<"saved" | "avulso">(
    campaigns.length > 0 ? "saved" : "avulso",
  );
  const [campaignId, setCampaignId] = React.useState(campaigns[0]?.id ?? "");
  const [tplName, setTplName] = React.useState(templates[0]?.name ?? "");
  const [shared, setShared] = React.useState<string[]>([]);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<OutreachSummary | null>(null);

  const tpl = templates.find((t) => t.name === tplName) ?? null;
  const varCount = tpl?.varCount ?? 0;
  // {{1}} = nome (automático). Campos do usuário: {{2}}..{{varCount}}.
  const sharedNeeded = Math.max(0, varCount - 1);
  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;

  // reseta os campos compartilhados ao trocar de template.
  React.useEffect(() => {
    setShared(Array(sharedNeeded).fill(""));
    setError(null);
  }, [tplName, sharedNeeded]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, sending]);

  const missing =
    sharedNeeded > 0 && shared.slice(0, sharedNeeded).some((v) => !v.trim());
  const firstName = targets[0]?.name?.trim() || "cliente";

  const confirmDisabled =
    sending ||
    targets.length === 0 ||
    (mode === "saved" ? !campaign : !tpl || missing);

  async function confirmar() {
    if (sending || confirmDisabled) return;
    setSending(true);
    setError(null);
    const res =
      mode === "saved"
        ? await dispatchCampaign(slug, campaignId, targets)
        : await sendTemplateToLeads(
            slug,
            targets,
            tpl!.name,
            tpl!.language,
            shared.slice(0, sharedNeeded),
            varCount,
          );
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "Não foi possível disparar.");
      return;
    }
    setResult(res);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => (sending ? null : onClose())}
      />
      <div className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border glass-2 shadow-soft animate-fade-up sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
              <Rocket className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Disparar template</h2>
              <p className="text-xs text-muted">
                {targets.length} lead{targets.length > 1 ? "s" : ""} selecionado
                {targets.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={() => (sending ? null : onClose())}
            aria-label="Fechar"
            disabled={sending}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {result ? (
            <ResultView result={result} />
          ) : (
            <>
              {/* Seletor de modo */}
              {campaigns.length > 0 ? (
                <div className="flex rounded-lg border border-border bg-surface-2/60 p-0.5 text-xs font-medium">
                  <button
                    onClick={() => setMode("saved")}
                    className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
                      mode === "saved"
                        ? "brand-gradient text-white"
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    Campanha salva
                  </button>
                  <button
                    onClick={() => setMode("avulso")}
                    className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
                      mode === "avulso"
                        ? "brand-gradient text-white"
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    Avulso
                  </button>
                </div>
              ) : null}

              {mode === "saved" ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">
                      Campanha salva
                    </label>
                    <div className="relative">
                      <Megaphone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
                      <select
                        value={campaignId}
                        onChange={(e) => setCampaignId(e.target.value)}
                        className="w-full appearance-none rounded-lg border border-border bg-surface-2 py-2.5 pl-9 pr-3 text-sm text-fg outline-none focus:border-secondary/50"
                      >
                        {campaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {campaign ? (
                    <>
                      <p className="text-[11px] text-muted-2">
                        Template: {campaign.templateName} ({campaign.templateLang})
                      </p>
                      {campaign.body ? (
                        <div>
                          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-2">
                            Prévia para {firstName}
                          </p>
                          <p className="whitespace-pre-wrap rounded-lg border border-secondary/25 bg-gradient-to-br from-secondary/15 to-accent-2/10 px-3 py-2.5 text-sm text-fg">
                            {fillPreview(campaign.body, firstName, campaign.vars)}
                          </p>
                        </div>
                      ) : null}
                      <p className="flex items-center gap-1.5 text-[11px] text-[#c4b5fd]">
                        <User className="size-3.5 shrink-0" />
                        {"{{1}}"} = nome de cada lead (automático)
                      </p>
                    </>
                  ) : null}
                </>
              ) : (
                <>
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

              {/* Preview do corpo do template */}
              {tpl && tpl.body ? (
                <div>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-2">
                    Corpo do template
                  </p>
                  <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2/50 px-3 py-2.5 text-sm text-muted">
                    {tpl.body}
                  </p>
                </div>
              ) : null}

              {/* {{1}} = nome (automático) */}
              {varCount >= 1 ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-accent-2/30 bg-accent-2/10 px-3 py-2 text-xs text-[#c4b5fd]">
                  <User className="size-3.5 shrink-0" />
                  <span>
                    <strong>{"{{1}}"}</strong> = nome do lead (preenchido
                    automaticamente por pessoa)
                  </span>
                </div>
              ) : null}

              {/* Campos das variáveis compartilhadas {{2}}..{{n}} */}
              {sharedNeeded > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-2">
                    Variáveis compartilhadas (valem para todos)
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

              {/* Preview de exemplo (primeiro lead) */}
              {tpl && tpl.body && varCount >= 1 ? (
                <div>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-2">
                    Prévia para {firstName}
                  </p>
                  <p className="whitespace-pre-wrap rounded-lg border border-secondary/25 bg-gradient-to-br from-secondary/15 to-accent-2/10 px-3 py-2.5 text-sm text-fg">
                    {fillPreview(tpl.body, firstName, shared)}
                  </p>
                </div>
              ) : null}
                </>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-xs text-accent">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  Isso envia uma mensagem real de WhatsApp para{" "}
                  <strong>{targets.length}</strong> pessoa
                  {targets.length > 1 ? "s" : ""}. Verifique antes de confirmar.
                </span>
              </div>

              {error ? (
                <p className="flex items-center gap-1.5 text-xs text-[#f87171]">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="border-t border-border p-4">
          {result ? (
            <button
              onClick={onDone}
              className="brand-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-all hover:brightness-110"
            >
              Concluir
            </button>
          ) : (
            <button
              onClick={confirmar}
              disabled={confirmDisabled}
              className="brand-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Enviando… (pode levar alguns segundos)
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Confirmar disparo
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultView({ result }: { result: OutreachSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-center">
          <div className="tnum text-2xl font-semibold text-[#4ade80]">
            {result.enviados}
          </div>
          <div className="text-xs text-muted">enviados</div>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center">
          <div className="tnum text-2xl font-semibold text-[#f87171]">
            {result.falhas}
          </div>
          <div className="text-xs text-muted">falhas</div>
        </div>
      </div>
      {result.falhas > 0 ? (
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {result.resultados
            .filter((r) => !r.ok)
            .map((r, i) => (
              <p
                key={`${r.phone}-${i}`}
                className="flex items-start gap-1.5 text-[11px] text-muted-2"
              >
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-[#f87171]" />
                <span className="tnum">{r.phone}</span>
                <span className="truncate">{r.error ?? "falhou"}</span>
              </p>
            ))}
        </div>
      ) : (
        <p className="text-center text-xs text-muted">
          Todos os templates foram enviados com sucesso.
        </p>
      )}
    </div>
  );
}

function LeadModal({
  slug,
  lead,
  onClose,
}: {
  slug: string;
  lead: FormLead;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const attribution = [
    { icon: Megaphone, label: "Campanha", value: lead.campaign_name },
    { icon: Layers, label: "Conjunto", value: lead.adset_name },
    { icon: ImageIcon, label: "Anúncio", value: lead.ad_name },
    { icon: Radio, label: "Plataforma", value: lead.platform },
  ].filter((a) => a.value);

  const extras = (lead.field_data ?? []).filter(
    (f) =>
      f?.name &&
      !HIDDEN_FIELDS.has(f.name.toLowerCase().trim()) &&
      Array.isArray(f.values) &&
      f.values.filter(Boolean).length > 0,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border glass-2 shadow-soft animate-fade-up sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
              <User className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">
                {lead.full_name ?? "Lead sem nome"}
              </h2>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-secondary">
                <ClipboardList className="size-3.5" />
                Formulário Meta
                {lead.form_name ? (
                  <span className="text-muted-2">· {lead.form_name}</span>
                ) : null}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Contato */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {lead.phone ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Phone className="size-3.5 text-muted-2" />
                <span className="tnum text-fg">{lead.phone}</span>
              </span>
            ) : null}
            {lead.email ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Mail className="size-3.5 text-muted-2" />
                <span className="truncate text-fg">{lead.email}</span>
              </span>
            ) : null}
          </div>

          {/* Atribuição */}
          {attribution.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-2">
                Atribuição
              </p>
              <div className="flex flex-wrap gap-1.5">
                {attribution.map((a) => {
                  const Icon = a.icon;
                  return (
                    <Badge key={a.label} tone="secondary" title={a.label}>
                      <Icon className="size-3" />
                      <span className="max-w-[200px] truncate">{a.value}</span>
                    </Badge>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Campos do formulário */}
          {extras.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-2">
                Respostas do formulário
              </p>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {extras.map((f) => (
                  <div
                    key={f.name}
                    className="rounded-lg border border-border bg-surface-2/50 px-3 py-2"
                  >
                    <dt className="text-[11px] text-muted-2">
                      {fieldLabel(f.name)}
                    </dt>
                    <dd className="mt-0.5 break-words text-sm text-fg">
                      {f.values.filter(Boolean).join(", ")}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {/* Disparo de template */}
          {lead.templateEnviado ? (
            <div className="flex items-center gap-1.5 text-xs text-[#c4b5fd]">
              <Send className="size-3.5" />
              Template {lead.ultimoTemplate ? `"${lead.ultimoTemplate}" ` : ""}
              enviado
              {lead.enviadoEm ? ` em ${formatDateTime(lead.enviadoEm)}` : ""}
            </div>
          ) : null}

          {/* Meta info */}
          <div className="flex items-center gap-1.5 text-xs text-muted-2">
            <Clock className="size-3.5" />
            Recebido em{" "}
            {lead.created_time ? formatDateTime(lead.created_time) : "—"}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          {lead.conversou && lead.session_id ? (
            <Link
              href={`/${slug}/conversas?c=${encodeURIComponent(lead.session_id)}`}
              className="brand-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.8)] transition-all hover:brightness-110"
            >
              <MessageCircle className="size-4" />
              Ver conversa
              <ArrowRight className="size-4" />
            </Link>
          ) : (
            <p className="flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-2.5 text-xs text-muted-2">
              <Clock className="size-3.5" />
              Ainda não iniciou conversa no WhatsApp
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
