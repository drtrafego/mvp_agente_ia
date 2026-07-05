"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { channelLabel } from "@/lib/utils";

const AXIS = "#6b7893";
const GRID = "#1f2a3c";

function fmtDay(day: string) {
  const d = new Date(day + "T00:00:00");
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

function TooltipBox({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color: string }[];
}) {
  return (
    <div className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium text-fg">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-muted">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: r.color }}
          />
          {r.label}: <span className="tnum font-medium text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

type DayPoint = { day: string; conversations: number; cost: number };

export function ConversationsChart({ data }: { data: DayPoint[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="day"
          tickFormatter={fmtDay}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <Tooltip
          cursor={{ stroke: GRID }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={fmtDay(String(payload[0].payload.day))}
                rows={[
                  {
                    label: "Conversas",
                    value: String(payload[0].value),
                    color: "#3b82f6",
                  },
                ]}
              />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="conversations"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#gConv)"
          dot={{ r: 2, fill: "#3b82f6" }}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CostChart({ data }: { data: DayPoint[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <XAxis
          dataKey="day"
          tickFormatter={fmtDay}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
        />
        <Tooltip
          cursor={{ fill: "rgba(217,119,6,0.08)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={fmtDay(String(payload[0].payload.day))}
                rows={[
                  {
                    label: "Custo",
                    value: `$${Number(payload[0].value).toFixed(4)}`,
                    color: "#d97706",
                  },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="cost" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={34} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const DONUT_COLORS = [
  "#3b82f6",
  "#d97706",
  "#1e40af",
  "#16a34a",
  "#8b5cf6",
  "#ec4899",
];

export function ChannelDonut({
  data,
}: {
  data: { channel: string; value: number }[];
}) {
  if (!data.length) return <Empty />;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="channel"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={channelLabel(String(payload[0].payload.channel))}
                    rows={[
                      {
                        label: "Conversas",
                        value: `${payload[0].value} (${Math.round(
                          (Number(payload[0].value) / total) * 100,
                        )}%)`,
                        color: payload[0].payload.fill,
                      },
                    ]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum text-2xl font-semibold">{total}</span>
          <span className="text-[11px] text-muted">conversas</span>
        </div>
      </div>
      <ul className="w-full space-y-2">
        {data.map((d, i) => (
          <li
            key={d.channel}
            className="flex items-center justify-between text-sm"
          >
            <span className="flex items-center gap-2 text-muted">
              <span
                className="inline-block size-2.5 rounded-sm"
                style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
              />
              {channelLabel(d.channel)}
            </span>
            <span className="tnum font-medium">
              {d.value}
              <span className="ml-1.5 text-xs text-muted-2">
                {Math.round((d.value / total) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-[180px] items-center justify-center text-sm text-muted-2">
      Sem dados no período
    </div>
  );
}

// ---- Dashboard "Visão geral" ----------------------------------------

type TimelinePoint = {
  day: string;
  leads: number;
  conversas: number;
  cost: number;
};

export function TimelineChart({
  data,
  todayStr,
}: {
  data: TimelinePoint[];
  todayStr: string;
}) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <XAxis
          dataKey="day"
          tickFormatter={fmtDay}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={30}
        />
        {data.length > 1 ? (
          <ReferenceLine
            x={todayStr}
            stroke="#8b5cf6"
            strokeDasharray="3 3"
            strokeOpacity={0.6}
          />
        ) : null}
        <Tooltip
          cursor={{ stroke: GRID }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={fmtDay(String(payload[0].payload.day))}
                rows={[
                  {
                    label: "Leads",
                    value: String(payload[0].payload.leads),
                    color: "#3b82f6",
                  },
                  {
                    label: "Conversas",
                    value: String(payload[0].payload.conversas),
                    color: "#8b5cf6",
                  },
                ]}
              />
            ) : null
          }
        />
        <Line
          type="monotone"
          dataKey="leads"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="conversas"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CostSparkline({ data }: { data: TimelinePoint[] }) {
  if (!data.length) return <div className="h-12" />;
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gCostMini" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d97706" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#d97706" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="cost"
          stroke="#d97706"
          strokeWidth={1.5}
          fill="url(#gCostMini)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const CAT_COLORS = ["#3b82f6", "#8b5cf6", "#d97706", "#16a34a", "#ec4899", "#14b8a6"];

export function CategoryDonut({
  data,
  unit = "leads",
}: {
  data: { key: string; value: number; label: string }[];
  unit?: string;
}) {
  if (!data.length) return <Empty />;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              innerRadius={48}
              outerRadius={70}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={String(payload[0].payload.label ?? payload[0].payload.key)}
                    rows={[
                      {
                        label: unit,
                        value: `${payload[0].value} (${Math.round(
                          (Number(payload[0].value) / total) * 100,
                        )}%)`,
                        color: payload[0].payload.fill,
                      },
                    ]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum text-xl font-semibold">{total}</span>
          <span className="text-[10px] text-muted">{unit}</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5">
        {data.slice(0, 5).map((d, i) => (
          <li key={d.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted">
              <span
                className="inline-block size-2.5 rounded-sm"
                style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
              />
              {d.label}
            </span>
            <span className="tnum font-medium">
              {d.value}
              <span className="ml-1.5 text-xs text-muted-2">
                {Math.round((d.value / total) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CampaignBars({
  data,
}: {
  data: { campaign: string; value: number }[];
}) {
  if (!data.length) return <Empty />;
  const height = Math.max(120, data.length * 38);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
      >
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="campaign"
          width={116}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) =>
            v.length > 18 ? v.slice(0, 17) + "…" : v
          }
        />
        <Tooltip
          cursor={{ fill: "rgba(59,130,246,0.08)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={String(payload[0].payload.campaign)}
                rows={[
                  {
                    label: "Leads",
                    value: String(payload[0].value),
                    color: "#3b82f6",
                  },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === 0 ? "#8b5cf6" : "#3b82f6"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
