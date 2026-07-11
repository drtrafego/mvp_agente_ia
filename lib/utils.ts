import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUSD(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n < 1 ? 4 : 2,
    maximumFractionDigits: 4,
  }).format(n);
}

export function formatNumber(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("pt-BR").format(Number(value ?? 0));
}

export function formatCompact(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value ?? 0));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "sem registro";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "sem registro";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "sem atividade";
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const mo = Math.floor(d / 30);
  return `há ${mo} mês${mo > 1 ? "es" : ""}`;
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  whatsapp_cloud: "WhatsApp Cloud",
  webhook: "Webhook",
  api_server: "API",
  cli: "CLI",
  unknown: "Desconhecido",
};

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return "Desconhecido";
  return CHANNEL_LABELS[channel] ?? channel;
}

const PLATFORM_LABELS: Record<string, string> = {
  ig: "Instagram",
  instagram: "Instagram",
  fb: "Facebook",
  facebook: "Facebook",
  an: "Audience Network",
  audience_network: "Audience Network",
  msg: "Messenger",
  messenger: "Messenger",
  ctwa: "Click WhatsApp",
  unknown: "Desconhecido",
};

export function platformLabel(platform: string | null | undefined): string {
  if (!platform) return "Desconhecido";
  return PLATFORM_LABELS[platform.toLowerCase()] ?? platform;
}

// Câmbio fixo para traduzir custo de inferência (USD) em R$ no painel.
// Ajuste aqui se quiser refletir a cotação real.
export const USD_TO_BRL = 5.4;

export function formatBRL(usd: number | string | null | undefined): string {
  const n = Number(usd ?? 0) * USD_TO_BRL;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 1 ? 3 : 2,
  }).format(n);
}

/** Delta percentual entre atual e anterior. null quando não há base. */
export function pctDelta(
  current: number,
  previous: number,
): number | null {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function formatPct(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}
