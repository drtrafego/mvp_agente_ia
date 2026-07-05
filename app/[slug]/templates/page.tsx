import { notFound } from "next/navigation";
import { MessageSquareText, Info, Ban, User } from "lucide-react";
import { getAgent } from "@/lib/agents";
import { getMetaConfig } from "@/lib/meta-config";
import { getApprovedTemplates } from "@/lib/actions";
import type { ApprovedTemplate } from "@/lib/actions";
import { PageHeader } from "@/components/page-header";
import { PageWrapper } from "@/components/page-wrapper";
import { Card, Badge } from "@/components/ui";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CATEGORY_TONE: Record<
  string,
  "secondary" | "violet" | "accent" | "neutral"
> = {
  UTILITY: "secondary",
  MARKETING: "violet",
  AUTHENTICATION: "accent",
};

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) notFound();

  const sendEnabled = !!getMetaConfig(slug);
  const templates = sendEnabled ? await getApprovedTemplates(slug) : [];

  return (
    <PageWrapper>
      <PageHeader
        title="Mensagens"
        subtitle={
          templates.length
            ? `${formatNumber(templates.length)} modelos aprovados na Meta`
            : "Modelos de mensagem aprovados na Meta"
        }
      />

      <div className="mb-5 flex items-start gap-2 rounded-xl border border-border bg-surface-2/50 px-4 py-3 text-xs text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-secondary" />
        <p>
          Estes são os modelos aprovados na Meta. Use no disparo (página{" "}
          <strong className="font-medium text-fg">Leads</strong>) ou nas
          conversas fora da janela de 24h. Para criar novos, use o{" "}
          <strong className="font-medium text-fg">WhatsApp Manager</strong> da
          Meta.
        </p>
      </div>

      {!sendEnabled ? (
        <EmptyState
          icon={<Ban className="size-6" />}
          title="Agente sem número oficial"
          text="Este agente não tem número de WhatsApp oficial configurado, então não há templates da Meta para exibir."
        />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText className="size-6" />}
          title="Nenhum template aprovado"
          text="Assim que houver modelos aprovados na Meta para este número, eles aparecem aqui."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((t) => (
            <TemplateCard key={`${t.name}-${t.language}`} tpl={t} />
          ))}
        </div>
      )}
    </PageWrapper>
  );
}

function TemplateCard({ tpl }: { tpl: ApprovedTemplate }) {
  const tone = CATEGORY_TONE[tpl.category?.toUpperCase()] ?? "neutral";
  return (
    <Card glass className="animate-fade-up flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-2/15 text-[#c4b5fd]">
            <MessageSquareText className="size-[18px]" />
          </span>
          <h3 className="truncate font-semibold" title={tpl.name}>
            {tpl.name}
          </h3>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {tpl.category ? (
          <Badge tone={tone}>{tpl.category}</Badge>
        ) : null}
        <Badge tone="neutral">{tpl.language}</Badge>
        {tpl.varCount > 1 ? (
          <Badge tone="secondary">
            {tpl.varCount} variáveis
          </Badge>
        ) : null}
      </div>

      {tpl.body ? (
        <p className="whitespace-pre-wrap rounded-xl border border-border bg-surface-2/50 px-3.5 py-3 text-sm leading-relaxed text-muted">
          <TemplateBody body={tpl.body} />
        </p>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-xs text-muted-2">
          Sem corpo de texto.
        </p>
      )}

      {tpl.varCount >= 1 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[#c4b5fd]">
          <User className="size-3.5 shrink-0" />
          <span>
            <strong className="font-medium">{"{{1}}"}</strong> = nome do lead (no
            disparo)
          </span>
        </p>
      ) : null}
    </Card>
  );
}

/** Renderiza o corpo do template realçando os placeholders {{n}}. */
function TemplateBody({ body }: { body: string }) {
  const parts = body.split(/(\{\{\s*\d+\s*\}\})/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\{\{\s*\d+\s*\}\}$/.test(part) ? (
          <span
            key={i}
            className="rounded bg-accent-2/20 px-1 font-medium text-[#c4b5fd]"
          >
            {part.replace(/\s+/g, "")}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="animate-fade-up grid place-items-center rounded-2xl border border-dashed border-border glass p-14 text-center shadow-soft">
      <div>
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-accent-2/15 text-[#c4b5fd]">
          {icon}
        </span>
        <p className="font-medium">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{text}</p>
      </div>
    </div>
  );
}
