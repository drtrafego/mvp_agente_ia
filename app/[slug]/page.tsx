import { Suspense } from "react";
import {
  MessagesSquare,
  MessageSquare,
  DollarSign,
  Cpu,
  TrendingUp,
  Radio,
} from "lucide-react";
import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { getOverview } from "@/lib/queries";
import { formatUSD, formatNumber, formatCompact } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageWrapper } from "@/components/page-wrapper";
import { KpiCard, KpiSkeleton } from "@/components/kpi";
import { Card, Skeleton } from "@/components/ui";
import { ConversationsChart, CostChart, ChannelDonut } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) notFound();

  return (
    <PageWrapper>
      <PageHeader
        title="Visão geral"
        subtitle={`Desempenho do agente ${agent?.name ?? ""}`}
      />
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent slug={slug} />
      </Suspense>
    </PageWrapper>
  );
}

async function OverviewContent({ slug }: { slug: string }) {
  const o = await getOverview(slug);
  const empty = o.conversations === 0;

  return (
    <div className="animate-fade-up space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Conversas"
          value={formatNumber(o.conversations)}
          icon={<MessagesSquare className="size-4" />}
          tone="secondary"
          featured
        />
        <KpiCard
          label="Mensagens"
          value={formatNumber(o.messages)}
          icon={<MessageSquare className="size-4" />}
          tone="primary"
          hint={
            o.conversations
              ? `${(o.messages / o.conversations).toFixed(1)} por conversa`
              : undefined
          }
        />
        <KpiCard
          label="Custo total"
          value={formatUSD(o.cost)}
          icon={<DollarSign className="size-4" />}
          tone="accent"
          hint={
            o.conversations
              ? `${formatUSD(o.cost / o.conversations)} por conversa`
              : undefined
          }
        />
        <KpiCard
          label="Tokens"
          value={formatCompact(o.inputTokens + o.outputTokens)}
          icon={<Cpu className="size-4" />}
          tone="success"
          hint={`${formatCompact(o.inputTokens)} in · ${formatCompact(
            o.outputTokens,
          )} out`}
        />
      </div>

      {empty ? (
        <Card className="grid place-items-center p-12 text-center">
          <Radio className="mb-3 size-8 text-muted-2" />
          <p className="font-medium">Ainda sem conversas</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Assim que o agente começar a atender, os KPIs e gráficos aparecem aqui.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card glass className="p-5 lg:col-span-2">
            <ChartHeader
              icon={<TrendingUp className="size-4 text-secondary" />}
              title="Conversas por dia"
              subtitle="Volume de atendimentos iniciados"
            />
            <ConversationsChart data={o.byDay} />
          </Card>

          <Card glass className="p-5">
            <ChartHeader
              icon={<DollarSign className="size-4 text-accent" />}
              title="Custo por dia"
              subtitle="Gasto de inferência em US$"
            />
            <CostChart data={o.byDay} />
          </Card>

          <Card glass className="p-5">
            <ChartHeader
              icon={<Radio className="size-4 text-secondary" />}
              title="Distribuição por canal"
              subtitle="Origem das conversas"
            />
            <ChannelDonut data={o.byChannel} />
          </Card>
        </div>
      )}
    </div>
  );
}

function ChartHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-surface-2">
        {icon}
      </span>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 lg:col-span-2">
          <Skeleton className="mb-4 h-8 w-48" />
          <Skeleton className="h-[220px] w-full" />
        </Card>
        <Card className="p-5">
          <Skeleton className="mb-4 h-8 w-40" />
          <Skeleton className="h-[220px] w-full" />
        </Card>
        <Card className="p-5">
          <Skeleton className="mb-4 h-8 w-40" />
          <Skeleton className="h-[180px] w-full" />
        </Card>
      </div>
    </div>
  );
}
