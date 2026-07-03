import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  DollarSign,
  MessageSquare,
  MessagesSquare,
  Activity,
} from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { getPortalStats } from "@/lib/queries";
import { formatUSD, formatNumber, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ACCENT: Record<
  string,
  { ring: string; icon: string; glow: string; dot: string }
> = {
  primary: {
    ring: "ring-primary/40 group-hover:ring-primary/70",
    icon: "bg-primary/20 text-secondary",
    glow: "from-primary/25",
    dot: "bg-secondary",
  },
  secondary: {
    ring: "ring-secondary/40 group-hover:ring-secondary/70",
    icon: "bg-secondary/20 text-secondary",
    glow: "from-secondary/25",
    dot: "bg-secondary",
  },
  accent: {
    ring: "ring-accent/40 group-hover:ring-accent/70",
    icon: "bg-accent/20 text-accent",
    glow: "from-accent/25",
    dot: "bg-accent",
  },
};

export default async function PortalPage() {
  const stats = await getPortalStats();

  const totals = Object.values(stats).reduce(
    (acc, s) => {
      acc.conversations += s.conversations;
      acc.messages += s.messages;
      acc.cost += s.cost;
      return acc;
    },
    { conversations: 0, messages: 0, cost: 0 },
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="animate-fade-up">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/20 text-secondary ring-1 ring-primary/40">
              <Bot className="size-5" />
            </div>
            <span className="text-sm font-medium text-muted">Central de Agentes IA</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Painel de atendimento
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted">
            Visão consolidada dos agentes de SAC. Selecione um agente para abrir o
            dashboard completo.
          </p>
        </div>

        <div className="flex gap-6 text-right">
          <PortalTotal
            label="Conversas"
            value={formatNumber(totals.conversations)}
          />
          <PortalTotal label="Mensagens" value={formatNumber(totals.messages)} />
          <PortalTotal label="Custo total" value={formatUSD(totals.cost)} />
        </div>
      </header>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((agent, i) => {
          const s = stats[agent.slug];
          const accent = ACCENT[agent.accent];
          const idle = s.conversations === 0;
          return (
            <Link
              key={agent.slug}
              href={`/${agent.slug}`}
              style={{ animationDelay: `${i * 60}ms` }}
              className={`group relative animate-fade-up overflow-hidden rounded-xl border border-border bg-surface p-5 ring-1 ring-inset ${accent.ring} transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary`}
            >
              <div
                className={`pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-gradient-to-br ${accent.glow} to-transparent opacity-70 blur-2xl`}
              />
              <div className="relative flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`grid size-11 place-items-center rounded-xl ${accent.icon}`}
                  >
                    <Bot className="size-6" />
                  </div>
                  <div>
                    <h2 className="font-semibold leading-tight">{agent.name}</h2>
                    <p className="text-xs text-muted">Persona {agent.persona}</p>
                  </div>
                </div>
                <ArrowUpRight className="size-5 text-muted-2 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
              </div>

              <p className="relative mt-4 text-sm text-muted">{agent.description}</p>

              <div className="relative mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
                <Metric
                  icon={<MessagesSquare className="size-3.5" />}
                  label="Conversas"
                  value={formatNumber(s.conversations)}
                />
                <Metric
                  icon={<MessageSquare className="size-3.5" />}
                  label="Mensagens"
                  value={formatNumber(s.messages)}
                />
                <Metric
                  icon={<DollarSign className="size-3.5" />}
                  label="Custo"
                  value={formatUSD(s.cost)}
                />
              </div>

              <div className="relative mt-4 flex items-center gap-2 text-xs text-muted">
                <span
                  className={`inline-block size-1.5 rounded-full ${
                    idle ? "bg-muted-2" : accent.dot
                  }`}
                />
                <Activity className="size-3.5" />
                {idle ? "Sem atividade ainda" : timeAgo(s.lastActivity)}
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}

function PortalTotal({ label, value }: { label: string; value: string }) {
  return (
    <div className="animate-fade-up">
      <div className="tnum text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-2">
        {icon}
        {label}
      </div>
      <div className="tnum mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}
