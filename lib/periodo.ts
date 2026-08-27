/**
 * Período do dashboard: presets + intervalo personalizado, sempre no FUSO DO
 * CLIENTE (America/Sao_Paulo), nunca em UTC.
 *
 * ⚠️ POR QUE ISTO EXISTE (26/08/2026). A "Visão geral" do Gramado Plazza
 * mostrava 16 conversas no filtro "Hoje" quando o dia tinha tido 63. O motivo:
 * o servidor da Vercel roda em UTC, então `new Date()` com `setHours(0,0,0,0)`
 * marcava o começo do dia às 00h UTC, que é 21h do dia ANTERIOR no horário do
 * Gastão. Às 22h22 dele, o "hoje" da tela cobria só a última hora e vinte.
 *
 * O Brasil não tem mais horário de verão desde 2019, então o offset fixo de
 * -03:00 é seguro e evita depender de tz database no runtime.
 */

/** Offset fixo do fuso do cliente, em minutos. */
export const TZ_OFFSET_MIN = -180; // America/Sao_Paulo, UTC-3

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "7d"
  | "14d"
  | "30d"
  | "90d"
  | "thisMonth"
  | "lastMonth";

/** Intervalo escolhido no calendário. Datas em AAAA-MM-DD, fuso do cliente. */
export type PeriodCustom = { from: string; to: string };

export type Period = PeriodPreset | PeriodCustom;

export const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "14d", label: "Últimos 14 dias" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "90d", label: "Últimos 90 dias" },
  { key: "thisMonth", label: "Este mês" },
  { key: "lastMonth", label: "Mês passado" },
];

const PRESET_KEYS = new Set<string>(PRESETS.map((p) => p.key));

export function isCustom(p: Period): p is PeriodCustom {
  return typeof p !== "string";
}

/** "2026-08-26" -> true. Rejeita data impossível tipo 2026-02-31. */
export function isIsoDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Lê o período da querystring. `?p=7d` ou `?p=2026-08-01:2026-08-26`.
 * Nunca lança: entrada inválida vira o padrão de 7 dias.
 */
export function parsePeriod(raw: string | undefined | null): Period {
  if (!raw) return "7d";
  if (PRESET_KEYS.has(raw)) return raw as PeriodPreset;
  const [from, to] = raw.split(":");
  if (isIsoDay(from) && isIsoDay(to) && from <= to) return { from, to };
  // intervalo invertido ainda é intenção clara: conserta em vez de descartar
  if (isIsoDay(from) && isIsoDay(to)) return { from: to, to: from };
  return "7d";
}

export function serializePeriod(p: Period): string {
  return isCustom(p) ? `${p.from}:${p.to}` : p;
}

/** Hoje no fuso do cliente, como AAAA-MM-DD. */
export function todayLocal(now: Date = new Date()): string {
  return new Date(now.getTime() + TZ_OFFSET_MIN * 60000)
    .toISOString()
    .slice(0, 10);
}

/** Instante UTC da meia-noite local daquele dia (início inclusivo). */
export function startOfLocalDay(day: string): Date {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - TZ_OFFSET_MIN * 60000);
}

/** Instante UTC do fim daquele dia local (exclusivo: 00h do dia seguinte). */
export function endOfLocalDay(day: string): Date {
  return new Date(startOfLocalDay(day).getTime() + 86400000);
}

export function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 86400000)
    .toISOString()
    .slice(0, 10);
}

/** Quantos dias o intervalo cobre, contando as duas pontas. */
export function daysInRange(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T12:00:00Z`).getTime() -
      new Date(`${from}T12:00:00Z`).getTime()) /
      86400000,
  ) + 1;
}

/**
 * Resolve o período em dias locais: o intervalo atual e o ANTERIOR de mesmo
 * tamanho, que é o que alimenta as setinhas de variação dos KPIs.
 */
export function resolveDays(
  p: Period,
  now: Date = new Date(),
): { from: string; to: string; prevFrom: string; prevTo: string } {
  const hoje = todayLocal(now);

  let from: string;
  let to: string;

  if (isCustom(p)) {
    from = p.from;
    to = p.to;
  } else if (p === "today") {
    from = to = hoje;
  } else if (p === "yesterday") {
    from = to = addDays(hoje, -1);
  } else if (p === "thisMonth") {
    from = `${hoje.slice(0, 7)}-01`;
    to = hoje;
  } else if (p === "lastMonth") {
    const primeiroDesteMes = `${hoje.slice(0, 7)}-01`;
    to = addDays(primeiroDesteMes, -1);
    from = `${to.slice(0, 7)}-01`;
  } else {
    // "7d" | "14d" | "30d" | "90d": termina HOJE e inclui hoje
    const n = Number(p.replace("d", "")) || 7;
    to = hoje;
    from = addDays(hoje, -(n - 1));
  }

  const n = daysInRange(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(n - 1));
  return { from, to, prevFrom, prevTo };
}

/** Os mesmos limites, em ISO UTC, prontos pro SQL (`>= inicio and < fim`). */
export function resolveRange(p: Period, now: Date = new Date()) {
  const { from, to, prevFrom, prevTo } = resolveDays(p, now);
  return {
    from,
    to,
    curStart: startOfLocalDay(from).toISOString(),
    curEnd: endOfLocalDay(to).toISOString(),
    prevStart: startOfLocalDay(prevFrom).toISOString(),
    prevEnd: endOfLocalDay(prevTo).toISOString(),
    todayStart: startOfLocalDay(todayLocal(now)).toISOString(),
  };
}

/** Rótulo humano do período, pro botão do seletor. */
export function periodLabel(p: Period): string {
  if (!isCustom(p)) {
    return PRESETS.find((x) => x.key === p)?.label ?? "Últimos 7 dias";
  }
  const fmt = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
  return p.from === p.to ? fmt(p.from) : `${fmt(p.from)} a ${fmt(p.to)}`;
}
