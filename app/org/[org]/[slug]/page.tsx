import Link from "next/link";
import {
  Users,
  MessagesSquare,
  CalendarClock,
  Activity,
  DollarSign,
  Target,
  TrendingUp,
  Trophy,
  Radio,
  Megaphone,
  Timer,
  MessageSquareDot,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { assertAgentAccess } from "@/lib/access";
import { getDashboard, type DashboardData, type Period } from "@/lib/queries";
import { PageWrapper } from "@/components/page-wrapper";
import { KpiCard } from "@/components/kpi";
import { Card, Badge } from "@/components/ui";
import { ChannelIcon } from "@/components/channel-icon";
import {
  TimelineChart,
  CategoryDonut,
  CampaignBars,
  CostSparkline,
} from "@/components/charts";
import {
  formatNumber,
  formatBRL,
  formatPct,
  pctDelta,
  platformLabel,
  channelLabel,
  timeAgo,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; slug: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { org, slug } = await params;
  const { p } = await searchParams;
  // Gate de acesso, alem do gate do layout. Nenhuma consulta acontece antes.
  const agent = await assertAgentAccess(slug);
  const basePath = `/org/${org}/${slug}`;

  const period: Period = p === "today" || p === "30d" ? p : "7d";

  const d = await getDashboard(slug, period);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <PageWrapper>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-gradient inline-block text-xl font-semibold tracking-tight sm:text-2xl">
            Visão geral
          </h1>
          <p className="mt-1 text-sm text-muted">
            Do anúncio à conversa · {agent.name}
          </p>
        </div>
        <PeriodTabs basePath={basePath} period={period} />
      </div>

      <div className="space-y-5">
        <KpiRow d={d} />
        <FunnelSection d={d} />
        <TimelineSection d={d} todayStr={todayStr} />
        {d.sourceKind === "form" ? (
          <>
            <AdRankingSection rows={d.adRanking} />
            <div className="grid gap-5 lg:grid-cols-2">
              <PlatformSection d={d} />
              <CampaignSection d={d} />
            </div>
          </>
        ) : d.sourceKind === "outreach" ? (
          <OutreachChannelSection d={d} />
        ) : null}
        <BotHealthSection d={d} />
        <InsightsSection d={d} />
        <RecentSection basePath={basePath} rows={d.recent} />
      </div>
    </PageWrapper>
  );
}

function PeriodTabs({ basePath, period }: { basePath: string; period: Period }) {
  return (
    <div className="flex w-full rounded-lg border border-border bg-surface-2/60 p-0.5 text-xs font-medium sm:w-auto">
      {PERIODS.map((it) => {
        const active = it.key === period;
        return (
          <Link
            key={it.key}
            href={`${basePath}?p=${it.key}`}
            scroll={false}
            className={`flex-1 rounded-md px-4 py-1.5 text-center transition-colors sm:flex-none ${
              active ? "brand-gradient text-white" : "text-muted hover:text-fg"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

/* ---- 1. KPIs ---- */
function KpiRow({ d }: { d: DashboardData }) {
  const taxaCur =
    d.leads.current > 0 ? (d.conversaram.current / d.leads.current) * 100 : 0;
  const taxaPrev =
    d.leads.previous > 0
      ? (d.conversaram.previous / d.leads.previous) * 100
      : 0;
  const custoPorConversa =
    d.conversas.current > 0 ? d.custoUsd.current / d.conversas.current : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label={d.sourceKind === "outreach" ? "Taxa de resposta" : "Taxa de conversa"}
        value={formatPct(taxaCur)}
        icon={<Target className="size-4" />}
        featured
        delta={pctDelta(taxaCur, taxaPrev)}
        hint={`${formatNumber(d.conversaram.current)} de ${formatNumber(
          d.leads.current,
        )} ${d.labels.leads.toLowerCase()}`}
      />
      <KpiCard
        label={d.labels.leads}
        value={formatNumber(d.leads.current)}
        icon={<Users className="size-4" />}
        tone="secondary"
        delta={pctDelta(d.leads.current, d.leads.previous)}
        hint={`${formatNumber(d.leadsToday)} hoje`}
      />
      <KpiCard
        label="Conversas"
        value={formatNumber(d.conversas.current)}
        icon={<MessagesSquare className="size-4" />}
        tone="violet"
        delta={pctDelta(d.conversas.current, d.conversas.previous)}
      />
      <KpiCard
        label="Ativas (24h)"
        value={formatNumber(d.conversasAtivas)}
        icon={<Activity className="size-4" />}
        tone="success"
        hint="com mensagem recente"
      />
      <KpiCard
        label="Custo de IA"
        value={formatBRL(d.custoUsd.current)}
        icon={<DollarSign className="size-4" />}
        tone="accent"
        delta={pctDelta(d.custoUsd.current, d.custoUsd.previous)}
        deltaInvert
        hint={`${formatBRL(custoPorConversa)} / conversa`}
      />
      <KpiCard
        label="CPL"
        value="—"
        icon={<CalendarClock className="size-4" />}
        tone="primary"
        hint="em breve (custo Meta)"
      />
    </div>
  );
}

/* ---- 2. Funil ---- */
function FunnelSection({ d }: { d: DashboardData }) {
  const isOutreach = d.sourceKind === "outreach";
  const steps = isOutreach
    ? [
        { label: d.labels.leads, value: d.leads.current, color: "bg-secondary", soon: false },
        {
          label: d.labels.conversaram,
          value: d.conversaram.current,
          color: "bg-accent-2",
          soon: false,
        },
        { label: "Engajaram", value: 0, color: "bg-success", soon: true },
        { label: "Agendaram", value: 0, color: "bg-muted-2", soon: true },
      ]
    : [
        { label: d.labels.leads, value: d.leads.current, color: "bg-secondary", soon: false },
        {
          label: d.labels.conversaram,
          value: d.conversaram.current,
          color: "bg-accent-2",
          soon: false,
        },
        {
          label: "Engajaram (4+ msgs)",
          value: d.engajaram,
          color: "bg-success",
          soon: false,
        },
        { label: "Agendaram", value: d.agendaram, color: "bg-muted-2", soon: true },
      ];
  const base = Math.max(steps[0].value, 1);

  return (
    <Card glass className="p-5">
      <SectionHead
        icon={<Target className="size-4 text-secondary" />}
        title="Funil de conversão"
        subtitle={
          isOutreach
            ? "Do disparo à resposta do lead"
            : "Do lead capturado ao agendamento"
        }
      />
      <div className="mt-4 space-y-2.5">
        {steps.map((s, i) => {
          const width = Math.max((s.value / base) * 100, s.value > 0 ? 6 : 2);
          const pass =
            i === 0
              ? null
              : steps[i - 1].value > 0
                ? (s.value / steps[i - 1].value) * 100
                : 0;
          return (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-xs text-muted sm:w-36 sm:text-sm">
                {s.label}
              </div>
              <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-surface-2">
                <div
                  className={`h-full rounded-lg ${s.color}`}
                  style={{ width: `${width}%`, opacity: s.soon ? 0.4 : 1 }}
                />
                <span className="tnum absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-fg">
                  {s.soon ? "em breve" : formatNumber(s.value)}
                </span>
              </div>
              <div className="w-12 shrink-0 text-right text-[11px] text-muted-2 sm:w-16">
                {pass === null ? (
                  <span className="text-secondary">100%</span>
                ) : s.soon ? (
                  "—"
                ) : (
                  formatPct(pass)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---- 3. Evolução ---- */
function TimelineSection({
  d,
  todayStr,
}: {
  d: DashboardData;
  todayStr: string;
}) {
  return (
    <Card glass className="p-5">
      <SectionHead
        icon={<TrendingUp className="size-4 text-secondary" />}
        title="Evolução no tempo"
        subtitle={`${d.labels.leads} e conversas por dia`}
        legend={
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <LegendDot color="#3b82f6" label={d.labels.leads} />
            <LegendDot color="#8b5cf6" label="Conversas" />
          </div>
        }
      />
      <div className="mt-3">
        <TimelineChart data={d.timeline} todayStr={todayStr} />
      </div>
    </Card>
  );
}

/* ---- 4. Ranking de anúncios ---- */
function AdRankingSection({ rows }: { rows: DashboardData["adRanking"] }) {
  const eligible = rows.filter((r) => r.leads >= 3);
  const bestName = eligible[0]?.ad_name;
  const worstName =
    eligible.length > 1 ? eligible[eligible.length - 1].ad_name : undefined;

  return (
    <Card glass className="p-5">
      <SectionHead
        icon={<Trophy className="size-4 text-accent" />}
        title="Ranking de anúncios por conversa real"
        subtitle="Qual criativo traz lead que de fato fala (não só volume)"
      />
      {rows.length === 0 ? (
        <p className="mt-4 py-6 text-center text-sm text-muted-2">
          Sem leads de anúncio no período.
        </p>
      ) : (
        <div className="mt-4 -mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-2">
                <th className="px-2 py-2 font-medium">Anúncio</th>
                <th className="px-2 py-2 font-medium">Campanha</th>
                <th className="px-2 py-2 text-right font-medium">Leads</th>
                <th className="px-2 py-2 text-right font-medium">Conv.</th>
                <th className="px-2 py-2 text-right font-medium">% conversa</th>
                <th className="px-2 py-2 text-right font-medium">CPL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isBest = r.ad_name === bestName;
                const isWorst = r.ad_name === worstName;
                return (
                  <tr
                    key={`${r.ad_name}-${i}`}
                    className={`border-b border-border/60 last:border-0 ${
                      isBest
                        ? "bg-success/5"
                        : isWorst
                          ? "bg-destructive/5"
                          : ""
                    }`}
                  >
                    <td className="max-w-[180px] px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="truncate font-medium"
                          title={r.ad_name}
                        >
                          {r.ad_name}
                        </span>
                        {isBest ? (
                          <Badge tone="success" className="shrink-0">
                            escalar
                          </Badge>
                        ) : isWorst ? (
                          <Badge tone="destructive" className="shrink-0">
                            revisar
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="max-w-[160px] truncate px-2 py-2.5 text-muted">
                      {r.campaign_name}
                    </td>
                    <td className="tnum px-2 py-2.5 text-right text-muted">
                      {formatNumber(r.leads)}
                    </td>
                    <td className="tnum px-2 py-2.5 text-right text-muted">
                      {formatNumber(r.conversaram)}
                    </td>
                    <td className="tnum px-2 py-2.5 text-right font-semibold">
                      <span
                        className={
                          r.taxa >= 50
                            ? "text-[#4ade80]"
                            : r.taxa < 20
                              ? "text-[#f87171]"
                              : "text-fg"
                        }
                      >
                        {formatPct(r.taxa)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right text-[11px] text-muted-2">
                      em breve
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ---- 5. Plataforma + campanhas ---- */
function PlatformSection({ d }: { d: DashboardData }) {
  return (
    <Card glass className="p-5">
      <SectionHead
        icon={<Radio className="size-4 text-secondary" />}
        title="Leads por plataforma"
        subtitle="Origem dos formulários"
      />
      <div className="mt-4">
        <CategoryDonut
          data={d.byPlatform.map((x) => ({
            key: x.platform,
            value: x.value,
            label: platformLabel(x.platform),
          }))}
        />
      </div>
    </Card>
  );
}

function CampaignSection({ d }: { d: DashboardData }) {
  return (
    <Card glass className="p-5">
      <SectionHead
        icon={<Megaphone className="size-4 text-accent-2" />}
        title="Top campanhas"
        subtitle="Volume de leads por campanha"
      />
      <div className="mt-4">
        {d.topCampaigns.length ? (
          <CampaignBars data={d.topCampaigns} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-2">
            Sem campanhas no período.
          </p>
        )}
      </div>
    </Card>
  );
}

/* ---- 5b. Prospecção por canal (fonte outreach) ---- */
function OutreachChannelSection({ d }: { d: DashboardData }) {
  return (
    <Card glass className="p-5">
      <SectionHead
        icon={<Radio className="size-4 text-secondary" />}
        title="Disparos por canal"
        subtitle="Distribuição da prospecção entre WhatsApp e e-mail"
      />
      <div className="mt-4">
        {d.outreachByChannel.length ? (
          <CategoryDonut
            data={d.outreachByChannel.map((x) => ({
              key: x.channel,
              value: x.value,
              label: channelLabel(x.channel),
            }))}
            unit="disparos"
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted-2">
            Sem disparos no período.
          </p>
        )}
      </div>
    </Card>
  );
}

/* ---- 6. Saúde do bot ---- */
function BotHealthSection({ d }: { d: DashboardData }) {
  return (
    <Card glass className="p-5">
      <SectionHead
        icon={<Gauge className="size-4 text-success" />}
        title="Saúde do bot"
        subtitle="Velocidade, volume e custo do atendimento"
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat
          icon={<Timer className="size-4" />}
          label="1ª resposta"
          value={formatDuration(d.bot.avgFirstRespSec)}
        />
        <MiniStat
          icon={<MessageSquareDot className="size-4" />}
          label="Msgs / conversa"
          value={d.bot.avgMsgs ? d.bot.avgMsgs.toFixed(1) : "0"}
        />
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-2">
            Custo de IA / dia
          </div>
          <div className="tnum text-sm font-semibold">
            {formatBRL(d.custoUsd.current)}
          </div>
          <CostSparkline data={d.timeline} />
        </div>
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-2">
            Canais
          </div>
          {d.byChannel.length ? (
            <ul className="space-y-1">
              {d.byChannel.slice(0, 3).map((c) => (
                <li
                  key={c.channel}
                  className="flex items-center justify-between text-xs text-muted"
                >
                  <span className="flex items-center gap-1.5">
                    <ChannelIcon channel={c.channel} className="size-3" />
                    {channelLabel(c.channel)}
                  </span>
                  <span className="tnum font-medium text-fg">{c.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-2">Sem dados</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ---- 7. Insights ---- */
function InsightsSection({ d }: { d: DashboardData }) {
  const insights = buildInsights(d);
  if (!insights.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {insights.map((it, i) => (
        <div
          key={i}
          className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${
            it.kind === "good"
              ? "border-success/30 bg-success/5"
              : it.kind === "bad"
                ? "border-destructive/30 bg-destructive/5"
                : "border-accent/30 bg-accent/5"
          }`}
        >
          <span className="mt-0.5 shrink-0">
            {it.kind === "good" ? (
              <CheckCircle2 className="size-4 text-[#4ade80]" />
            ) : it.kind === "bad" ? (
              <XCircle className="size-4 text-[#f87171]" />
            ) : (
              <AlertTriangle className="size-4 text-accent" />
            )}
          </span>
          <p className="text-muted">{it.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ---- 8. Últimas conversas ---- */
function RecentSection({
  basePath,
  rows,
}: {
  basePath: string;
  rows: DashboardData["recent"];
}) {
  return (
    <Card glass className="p-5">
      <SectionHead
        icon={<MessagesSquare className="size-4 text-secondary" />}
        title="Últimas conversas"
        subtitle="Atendimentos mais recentes"
      />
      {rows.length === 0 ? (
        <p className="mt-4 py-6 text-center text-sm text-muted-2">
          Nenhuma conversa registrada.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/60">
          {rows.map((r) => {
            const msgs = r.message_count ?? 0;
            const name =
              r.full_name ?? r.title ?? r.chat_id ?? "Contato sem nome";
            return (
              <li key={r.session_id}>
                <Link
                  href={`${basePath}/conversas?c=${encodeURIComponent(r.session_id)}`}
                  className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-surface-2/60"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-muted">
                    <ChannelIcon channel={r.channel} className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-[11px] text-muted-2">
                      {channelLabel(r.channel)} · {timeAgo(r.started_at)}
                    </p>
                  </div>
                  {msgs >= 4 ? (
                    <Badge tone="success" className="shrink-0">
                      engajou
                    </Badge>
                  ) : msgs > 0 ? (
                    <Badge tone="secondary" className="shrink-0">
                      conversou
                    </Badge>
                  ) : (
                    <Badge tone="neutral" className="shrink-0">
                      nova
                    </Badge>
                  )}
                  <ChevronRight className="size-4 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---- helpers de UI ---- */
function SectionHead({
  icon,
  title,
  subtitle,
  legend,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  legend?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2">
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </div>
      {legend}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block size-2 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-2">
        {icon}
        {label}
      </div>
      <div className="tnum mt-1.5 text-xl font-semibold">{value}</div>
    </div>
  );
}

function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  return `${(sec / 3600).toFixed(1)}h`;
}

type Insight = { kind: "good" | "warn" | "bad"; text: string };

function buildInsights(d: DashboardData): Insight[] {
  const out: Insight[] = [];
  const leadsDelta = pctDelta(d.leads.current, d.leads.previous);
  const convDelta = pctDelta(d.conversas.current, d.conversas.previous);
  const custoDelta = pctDelta(d.custoUsd.current, d.custoUsd.previous);
  const taxa =
    d.leads.current > 0 ? (d.conversaram.current / d.leads.current) * 100 : 0;

  const noun = d.labels.leads;
  const nounLow = noun.toLowerCase();

  if (leadsDelta !== null && leadsDelta <= -15) {
    out.push({
      kind: "bad",
      text: `${noun} caíram ${Math.abs(
        Math.round(leadsDelta),
      )}% vs o período anterior. Vale revisar a fonte.`,
    });
  } else if (leadsDelta !== null && leadsDelta >= 15) {
    out.push({
      kind: "good",
      text: `${noun} subiram ${Math.round(
        leadsDelta,
      )}% vs o período anterior. Bom momento para escalar.`,
    });
  }

  const best = d.adRanking.filter((r) => r.leads >= 3)[0];
  if (best) {
    out.push({
      kind: "good",
      text: `Anúncio "${best.ad_name}" tem a melhor taxa de conversa (${formatPct(
        best.taxa,
      )}). Considere escalar.`,
    });
  }

  if (
    custoDelta !== null &&
    custoDelta >= 15 &&
    (convDelta === null || convDelta <= 0)
  ) {
    out.push({
      kind: "warn",
      text: `Custo de IA subiu ${Math.round(
        custoDelta,
      )}% sem aumento de conversas. Verifique o consumo do bot.`,
    });
  }

  if (d.leads.current >= 5 && taxa < 30) {
    out.push({
      kind: "warn",
      text:
        d.sourceKind === "outreach"
          ? `Só ${formatPct(taxa)} dos ${nounLow} responderam. Teste outro template ou horário de disparo.`
          : `Só ${formatPct(taxa)} dos ${nounLow} iniciam conversa. Dispare um template de 1º toque na página Leads.`,
    });
  }

  return out.slice(0, 3);
}
