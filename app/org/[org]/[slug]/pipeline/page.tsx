import Link from "next/link";
import { Info, Sparkles } from "lucide-react";
import { getLeads, STAGES, type Stage, type Lead } from "@/lib/queries";
import { assertAgentAccess } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { PageWrapper } from "@/components/page-wrapper";
import { Badge } from "@/components/ui";
import { ChannelIcon } from "@/components/channel-icon";
import { channelLabel, formatNumber, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STAGE_META: Record<
  Stage,
  { tone: "neutral" | "secondary" | "accent" | "success" | "destructive"; bar: string }
> = {
  Novo: { tone: "secondary", bar: "bg-secondary" },
  "Em conversa": { tone: "accent", bar: "bg-accent" },
  Agendado: { tone: "success", bar: "bg-success" },
  Perdido: { tone: "destructive", bar: "bg-destructive" },
};

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ org: string; slug: string }>;
}) {
  const { org, slug } = await params;
  await assertAgentAccess(slug);
  const basePath = `/org/${org}/${slug}`;
  const board = await getLeads(slug);
  const total = STAGES.reduce((s, st) => s + board[st].length, 0);

  return (
    <PageWrapper>
      <PageHeader
        title="Pipeline de leads"
        subtitle={`${formatNumber(total)} contatos distribuídos por etapa`}
        action={
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted">
            <Sparkles className="size-3.5 text-accent" />
            Etapas inferidas automaticamente
          </div>
        }
      />

      {total === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-border p-12 text-center">
          <p className="font-medium">Nenhum lead ainda</p>
          <p className="mt-1 text-sm text-muted">
            As conversas do agente aparecem aqui organizadas por etapa.
          </p>
        </div>
      ) : (
        <>
          <div className="grid animate-fade-up gap-4 md:grid-cols-2 xl:grid-cols-4">
            {STAGES.map((stage) => (
              <Column key={stage} basePath={basePath} stage={stage} leads={board[stage]} />
            ))}
          </div>
          <p className="mt-5 flex items-center gap-1.5 text-xs text-muted-2">
            <Info className="size-3.5" />
            As etapas são derivadas do assunto de cada conversa. Edição manual e
            arraste ficam para a próxima versão.
          </p>
        </>
      )}
    </PageWrapper>
  );
}

function Column({
  basePath,
  stage,
  leads,
}: {
  basePath: string;
  stage: Stage;
  leads: Lead[];
}) {
  const meta = STAGE_META[stage];
  return (
    <div className="flex flex-col rounded-xl border border-border glass shadow-soft">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-4 w-1 rounded-full ${meta.bar}`} />
          <span className="text-sm font-semibold">{stage}</span>
        </div>
        <Badge tone={meta.tone}>{leads.length}</Badge>
      </div>
      <div className="flex max-h-[calc(100dvh-15rem)] flex-col gap-2 overflow-y-auto p-2.5">
        {leads.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-2">Vazio</p>
        ) : (
          leads.map((lead) => (
            <Link
              key={lead.session_id}
              href={`${basePath}/conversas?c=${encodeURIComponent(lead.session_id)}`}
              className="group rounded-lg border border-border bg-surface p-3 shadow-soft transition-all duration-150 hover:-translate-y-0.5 hover:border-secondary/40 hover:bg-surface-2"
            >
              <p className="line-clamp-2 text-sm font-medium leading-snug">
                {lead.title ?? "Conversa sem título"}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <ChannelIcon channel={lead.channel} />
                <span className="truncate">{channelLabel(lead.channel)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-2">
                <span className="tnum truncate">
                  {lead.chat_id ?? "sem contato"}
                </span>
                <span className="shrink-0">{timeAgo(lead.started_at)}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
