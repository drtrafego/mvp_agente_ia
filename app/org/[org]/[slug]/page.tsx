import Link from "next/link";
import {
  MessagesSquare,
  Target,
  TrendingUp,
  Users,
  DollarSign,
  MessageSquare,
  Trophy,
  Radio,
  Megaphone,
  Timer,
  Activity,
  ArrowUp,
  ArrowDown,
  Minus,
  TrendingDown,
  ChevronRight,
} from "lucide-react";
import { assertAgentAccess } from "@/lib/access";
import { getDashboard, type DashboardData } from "@/lib/queries";
import { maiorPerda, taxaFimAFim, type Funil } from "@/lib/funil";
import { KpiCard } from "@/components/kpi";
import {
  parsePeriod,
  serializePeriod,
  todayLocal,
  type Period,
} from "@/lib/periodo";
import { PageWrapper } from "@/components/page-wrapper";
import { DateRangePicker } from "@/components/date-range-picker";
import { Card, Badge } from "@/components/ui";
import { ChannelIcon } from "@/components/channel-icon";
import { FunilTimeline, CategoryDonut, CampaignBars } from "@/components/charts";
import {
  formatNumber,
  formatPct,
  formatBRL,
  formatReais,
  pctDelta,
  platformLabel,
  channelLabel,
  timeAgo,
  cn,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * A "Visão geral" É O FUNIL DO BOT. Não é uma lista de cards.
 *
 * ⚠️ 27/08/2026. A tela anterior era seis KPIs montados sobre public.meta_leads
 * (19 linhas na vida inteira) e public.ctwa_referrals (2 linhas na história).
 * Fonte morta: os quatro bots apareciam zerados e a tela parecia quebrada. As
 * etapas agora saem de lib/funil.ts, cada uma da fonte que AQUELE bot tem.
 *
 * ⚠️ Etapa que o bot NÃO mede não vira zero na tela, some e explica no rodapé.
 * Zero no lugar de dado inexistente lê como performance ruim.
 *
 * O que saiu daqui de propósito, não repor: custo de IA, "Conversaram" e
 * "Engajaram" como cards soltos (viraram etapas), leads de meta_leads,
 * campanhas e anúncios no topo (viraram a aba "Origem", que só aparece quando
 * há dado no período), tempo de 1ª resposta (virou selo) e média de mensagens.
 */
export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; slug: string }>;
  searchParams: Promise<{ p?: string; aba?: string }>;
}) {
  const { org, slug } = await params;
  const { p, aba } = await searchParams;
  // Gate de acesso, alem do gate do layout. Nenhuma consulta acontece antes.
  const agent = await assertAgentAccess(slug);
  const basePath = `/org/${org}/${slug}`;

  const period: Period = parsePeriod(p);
  const d = await getDashboard(slug, period);
  const todayStr = todayLocal(); // ⚠️ fuso do cliente, não UTC

  // A aba "Origem" só existe quando há anúncio/campanha no período. Sem dado,
  // ela nem aparece: aba vazia é promessa quebrada.
  const temOrigem =
    d.adRanking.length > 0 || d.topCampaigns.length > 0 || d.byPlatform.length > 0;
  const abaAtiva = aba === "origem" && temOrigem ? "origem" : "funil";

  return (
    <PageWrapper>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-gradient inline-block text-xl font-semibold tracking-tight sm:text-2xl">
            Visão geral
          </h1>
          <p className="mt-1 text-sm text-muted">
            O funil do {agent.name}, da primeira conversa ao fechamento
          </p>
        </div>
        <DateRangePicker period={period} basePath={basePath} />
      </div>

      {temOrigem ? (
        <Abas basePath={basePath} period={period} ativa={abaAtiva} />
      ) : null}

      {abaAtiva === "funil" ? (
        <div className="space-y-5">
        <KpiCards d={d} funil={d.funil} />
        <ResumoSection funil={d.funil} />
          <FunilSection d={d} />
          <EvolucaoSection funil={d.funil} todayStr={todayStr} />
          <RecentSection basePath={basePath} rows={d.recent} />
        </div>
      ) : (
        <div className="space-y-5">
          <AdRankingSection rows={d.adRanking} />
          <div className="grid gap-5 lg:grid-cols-2">
            <PlatformSection d={d} />
            <CampaignSection d={d} />
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

/* ---- abas ---- */
function Abas({
  basePath,
  period,
  ativa,
}: {
  basePath: string;
  period: Period;
  ativa: "funil" | "origem";
}) {
  const q = `p=${encodeURIComponent(serializePeriod(period))}`;
  const item = (key: "funil" | "origem", label: string) => (
    <Link
      href={`${basePath}?${q}${key === "origem" ? "&aba=origem" : ""}`}
      scroll={false}
      className={cn(
        "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors duration-200",
        ativa === key
          ? "bg-surface-3 text-fg"
          : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="mb-5 inline-flex gap-1 rounded-xl border border-border bg-surface p-1">
      {item("funil", "Funil")}
      {item("origem", "Origem")}
    </div>
  );
}

/* ---- 1. A taxa que importa: fim a fim ---- */

/**
 * Os KPIs mais importantes em cards, no topo. Ele pediu esse formato de volta
 * em 27/08 ("o layout de ontem estava melhor, quero os cards acima").
 *
 * A diferença pro layout antigo é a FONTE: cada card sai de uma etapa do funil,
 * não das tabelas mortas (meta_leads tinha 19 linhas na vida inteira). Card de
 * etapa que este bot não mede simplesmente não aparece, em vez de mostrar zero.
 */
function KpiCards({ d, funil }: { d: DashboardData; funil: Funil }) {
  const taxa = taxaFimAFim(funil);
  const r = d.reservas;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {taxa ? (
        <KpiCard
          label={taxa.completo ? "Taxa de conversão" : `Até ${taxa.fim.verbo}`}
          value={formatPct(taxa.pct, 1)}
          icon={<TrendingUp className="size-4" />}
          tone="success"
          hint={`${formatNumber(taxa.fim.value)} de ${formatNumber(taxa.topo.value)} ${funil.unidade}`}
        />
      ) : null}

      {funil.etapas.map((e) => (
        <KpiCard
          key={e.key}
          label={e.label}
          value={formatNumber(e.value)}
          icon={<Users className="size-4" />}
          tone={e.key === "fechou" ? "primary" : "accent"}
          delta={
            funil.comparavel && e.previous !== null
              ? pctDelta(e.value, e.previous)
              : null
          }
          hint={e.hint ?? e.fonte}
        />
      ))}

      {r ? (
        <>
          {/* ⚠️ formatReais, NUNCA formatBRL: formatBRL converte DÓLAR e
              multiplica por 5,4. A receita das reservas já vem em real do banco
              do restaurante, e o card mostrou R$ 150.411,33 no lugar de
              R$ 27.854 até 03/09/2026. */}
          <KpiCard
            label="Receita reservada"
            value={formatReais(r.receita)}
            icon={<DollarSign className="size-4" />}
            tone="accent"
            hint={`${formatNumber(r.pessoas)} pessoas · inclui quem ainda vai jantar`}
          />
          {/* Só quem confirmou chegada, pelo dia do JANTAR. Régua diferente da
              de cima (que conta pelo dia da RESERVA, pra casar com o dia do
              anúncio pago): as duas estão certas, por isso as duas aparecem. */}
          <KpiCard
            label="Receita na casa"
            value={formatReais(r.realizada.receita)}
            icon={<DollarSign className="size-4" />}
            tone="success"
            hint={`${formatNumber(r.realizada.pessoas)} pessoas que compareceram`}
          />
        </>
      ) : null}

      <KpiCard
        label="Ativas (24h)"
        value={formatNumber(d.conversasAtivas)}
        icon={<MessageSquare className="size-4" />}
        tone="accent"
        hint="com mensagem recente"
      />
    </div>
  );
}

function ResumoSection({ funil }: { funil: Funil }) {
  const taxa = taxaFimAFim(funil);
  const perda = maiorPerda(funil);
  if (!taxa) return null;

  const delta =
    funil.comparavel && taxa.fim.previous !== null && taxa.topo.previous !== null
      ? pctDelta(
          taxa.topo.value > 0 ? taxa.fim.value / taxa.topo.value : 0,
          taxa.topo.previous > 0 ? taxa.fim.previous / taxa.topo.previous : 0,
        )
      : null;

  return (
    <Card glass className="relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-gradient-to-br from-secondary/25 via-accent-2/15 to-transparent blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {taxa.completo
              ? "Taxa fim a fim"
              : `Do topo até ${taxa.fim.verbo}`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="tnum text-4xl font-semibold tracking-tight sm:text-5xl">
              {formatPct(taxa.pct, 1)}
            </span>
            {delta !== null ? (
              <Variacao delta={delta} destacar={funil.destacarVariacao} />
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted">
            {formatNumber(taxa.fim.value)} de {formatNumber(taxa.topo.value)}{" "}
            {funil.unidade} chegaram até {taxa.fim.verbo}
          </p>
        </div>

        {perda ? (
          <div className="flex max-w-sm items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/5 p-3.5">
            <TrendingDown className="mt-0.5 size-4 shrink-0 text-accent" />
            <p className="text-sm text-muted">
              <span className="font-medium text-fg">
                Perde {formatPct(perda.pct)}
              </span>{" "}
              entre {perda.de} e {perda.para}. É aí que vale mexer primeiro.
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/* ---- 2. O funil ---- */
const CORES: Record<string, string> = {
  chegou: "bg-secondary",
  respondeu: "bg-accent-2",
  avancou: "bg-accent",
  fechou: "bg-success",
  extra: "bg-primary",
};

function FunilSection({ d }: { d: DashboardData }) {
  const funil = d.funil;
  const base = Math.max(funil.etapas[0]?.value ?? 0, 1);

  return (
    <Card glass className="p-5">
      <SectionHead
        icon={<Target className="size-4 text-secondary" />}
        title="Funil do bot"
        subtitle={`Cada etapa em ${funil.unidade}, sem contar a mesma pessoa duas vezes`}
      />

      <div className="mt-4 space-y-2.5">
        {funil.etapas.map((e, i) => {
          const anterior = i > 0 ? funil.etapas[i - 1] : null;
          const passagem =
            anterior && anterior.value > 0
              ? (e.value / anterior.value) * 100
              : null;
          const largura = Math.max((e.value / base) * 100, e.value > 0 ? 6 : 2);
          const delta =
            funil.comparavel && e.previous !== null
              ? pctDelta(e.value, e.previous)
              : null;

          return (
            <div key={e.key} className="flex items-center gap-3">
              <div className="w-28 shrink-0 sm:w-44">
                <p className="truncate text-xs font-medium text-fg sm:text-sm">
                  {e.label}
                </p>
                <p className="truncate text-[11px] text-muted-2" title={e.fonte}>
                  {e.fonte}
                </p>
              </div>

              <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-surface-2">
                <div
                  className={cn("h-full rounded-lg transition-all", CORES[e.key])}
                  style={{ width: `${largura}%` }}
                />
                {/* Chip escuro atrás do número: texto claro direto sobre a
                    barra âmbar/verde não passa no contraste AA. */}
                <div className="absolute inset-y-0 left-2 flex items-center">
                  <span className="inline-flex items-center gap-2 rounded-md bg-surface/75 px-2 py-0.5">
                    <span className="tnum text-xs font-semibold text-fg">
                      {formatNumber(e.value)}
                    </span>
                    {e.hint ? (
                      <span className="hidden text-[11px] text-muted sm:inline">
                        {e.hint}
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>

              {/* Passagem = quantos da etapa anterior chegaram aqui. A variação
                  contra o período anterior vem embaixo, quando existe. */}
              <div className="flex w-14 shrink-0 flex-col items-end gap-1 sm:w-20">
                {passagem !== null ? (
                  <span className="tnum text-[11px] text-muted-2">
                    {formatPct(passagem)}
                  </span>
                ) : null}
                {delta !== null ? (
                  <Variacao delta={delta} destacar={funil.destacarVariacao} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <Rodape d={d} />
    </Card>
  );
}

/**
 * O rodapé carrega o que sobrou dos cards antigos e o aviso que evita leitura
 * errada: as últimas etapas do período ainda vão subir.
 */
function Rodape({ d }: { d: DashboardData }) {
  const funil = d.funil;
  const resp = formatDuration(d.bot.avgFirstRespSec);
  return (
    <div className="mt-5 space-y-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-2">
        {resp !== "—" ? (
          <span className="inline-flex items-center gap-1.5">
            <Timer className="size-3.5" />
            Responde em {resp}, em média
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <Activity className="size-3.5" />
          {formatNumber(d.conversasAtivas)} em conversa nas últimas 24h
        </span>
      </div>

      <p className="text-[11px] text-muted-2">
        Quem chegou ontem ou hoje ainda pode fechar amanhã: as últimas etapas
        deste período ainda vão subir.
      </p>

      {funil.ausentes.map((linha) => (
        <p key={linha} className="text-[11px] text-muted-2">
          {linha}
        </p>
      ))}
    </div>
  );
}

/* ---- 3. Evolução ---- */
function EvolucaoSection({
  funil,
  todayStr,
}: {
  funil: Funil;
  todayStr: string;
}) {
  return (
    <Card glass className="p-5">
      <SectionHead
        icon={<TrendingUp className="size-4 text-secondary" />}
        title="O funil no tempo"
        subtitle="Quem chegou e quem fechou, dia a dia"
        legend={
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <LegendDot color="#3b82f6" label={funil.serie.chegou} />
            {funil.serie.fechou ? (
              <LegendDot color="#4ade80" label={funil.serie.fechou} />
            ) : null}
          </div>
        }
      />
      <div className="mt-3">
        <FunilTimeline
          data={funil.porDia}
          todayStr={todayStr}
          labels={funil.serie}
        />
      </div>
    </Card>
  );
}

/* ---- 4. Aba Origem: de onde veio quem chegou ---- */
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
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-2">
                <th className="px-2 py-2 font-medium">Anúncio</th>
                <th className="px-2 py-2 font-medium">Campanha</th>
                <th className="px-2 py-2 text-right font-medium">Leads</th>
                <th className="px-2 py-2 text-right font-medium">Conv.</th>
                <th className="px-2 py-2 text-right font-medium">% conversa</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isBest = r.ad_name === bestName;
                const isWorst = r.ad_name === worstName;
                return (
                  <tr
                    key={`${r.ad_name}-${i}`}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      isBest && "bg-success/5",
                      isWorst && "bg-destructive/5",
                    )}
                  >
                    <td className="max-w-[180px] px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium" title={r.ad_name}>
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

function PlatformSection({ d }: { d: DashboardData }) {
  return (
    <Card glass className="p-5">
      <SectionHead
        icon={<Radio className="size-4 text-secondary" />}
        title="Leads por plataforma"
        subtitle="Onde o anúncio foi visto"
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

/* ---- 5. Últimas conversas ---- */
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
            const name = r.full_name ?? r.title ?? r.chat_id ?? "Contato sem nome";
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
                      avançou
                    </Badge>
                  ) : msgs > 0 ? (
                    <Badge tone="secondary" className="shrink-0">
                      respondeu
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

/**
 * ⚠️ `destacar=false` é rigor, não enfeite: com menos de 30 pessoas na semana,
 * 10% é ruído estatístico. O número continua na tela, sem a cor que manda o
 * cliente comemorar ou entrar em pânico à toa.
 */
function Variacao({ delta, destacar }: { delta: number; destacar: boolean }) {
  const n = Math.round(delta);
  const flat = n === 0;
  const Icon = flat ? Minus : n > 0 ? ArrowUp : ArrowDown;
  const cls = !destacar || flat
    ? "bg-surface-2 text-muted-2"
    : n > 0
      ? "bg-success/15 text-[#4ade80]"
      : "bg-destructive/15 text-[#f87171]";
  return (
    <span
      title={
        destacar
          ? "Contra o período anterior de mesmo tamanho"
          : "Base pequena no período: variação é ruído, por isso sem destaque"
      }
      className={cn(
        "tnum inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        cls,
      )}
    >
      <Icon className="size-3" />
      {Math.abs(n)}%
    </span>
  );
}

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

function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  return `${(sec / 3600).toFixed(1)}h`;
}
