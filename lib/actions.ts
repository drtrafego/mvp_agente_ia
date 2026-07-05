"use server";

import { revalidatePath } from "next/cache";
import { getAgent } from "./agents";
import { getMetaConfig } from "./meta-config";
import {
  sendWhatsappText,
  sendWhatsappTemplate,
  listApprovedTemplates,
  type ApprovedTemplate,
} from "./clients/meta-whatsapp";

const BASE_URL =
  process.env.HERMES_PANEL_URL ?? "https://hermes.casaldotrafego.com/agente";

export type ActionResult = {
  ok: boolean;
  error?: string;
  /** true quando o envio falhou por estar fora da janela de 24h. */
  outsideWindow?: boolean;
};

export type { ApprovedTemplate };

async function callPanel(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const token = process.env.PAINEL_API_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "PAINEL_API_TOKEN não configurado no servidor.",
    };
  }
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
      cache: "no-store",
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg =
        (data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : null) ?? `Erro ${res.status} no painel.`;
      return { ok: false, status: res.status, data, error: msg };
    }
    return { ok: true, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "Falha de rede ao contatar o painel do Hermes.",
    };
  }
}

/** Lista de chat_ids pausados de um agente. Nunca lança: em erro retorna []. */
export async function getPausedChatIds(slug: string): Promise<string[]> {
  if (!getAgent(slug)) return [];
  const res = await callPanel(
    `/api/pausados?agente=${encodeURIComponent(slug)}`,
    { method: "GET" },
  );
  if (!res.ok) return [];
  const list = (res.data as { pausados?: unknown } | null)?.pausados;
  if (!Array.isArray(list)) return [];
  return list.map((v) => String(v));
}

export async function togglePauseAction(
  slug: string,
  chatId: string | null,
  pause: boolean,
): Promise<ActionResult> {
  if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
  if (!chatId) return { ok: false, error: "Conversa sem contato vinculado." };

  const res = await callPanel(pause ? "/api/pausar" : "/api/retomar", {
    method: "POST",
    body: JSON.stringify({ agente: slug, chat_id: chatId }),
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath(`/${slug}/conversas`);
  return { ok: true };
}

/** Envia texto livre direto pela WhatsApp Cloud API da Meta. */
export async function sendReplyAction(
  slug: string,
  chatId: string | null,
  texto: string,
): Promise<ActionResult> {
  try {
    if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
    if (!chatId) return { ok: false, error: "Conversa sem contato vinculado." };
    const msg = texto.trim();
    if (!msg) return { ok: false, error: "Digite uma mensagem." };

    const cfg = getMetaConfig(slug);
    if (!cfg) {
      return {
        ok: false,
        error: "Este agente não tem número de WhatsApp oficial configurado.",
      };
    }

    const r = await sendWhatsappText(chatId, msg, cfg.phoneNumberId);
    if (!r.ok) {
      return {
        ok: false,
        error: r.error ?? "Não foi possível enviar a mensagem.",
        outsideWindow: r.outsideWindow,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao enviar a mensagem." };
  }
}

/** Envia um template aprovado (reengajamento fora da janela de 24h). */
export async function sendTemplateAction(
  slug: string,
  chatId: string | null,
  templateName: string,
  lang: string,
  params: string[] = [],
): Promise<ActionResult> {
  try {
    if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
    if (!chatId) return { ok: false, error: "Conversa sem contato vinculado." };
    if (!templateName)
      return { ok: false, error: "Selecione um template." };

    const cfg = getMetaConfig(slug);
    if (!cfg) {
      return {
        ok: false,
        error: "Este agente não tem número de WhatsApp oficial configurado.",
      };
    }

    const clean = params.map((p) => p.trim()).filter(Boolean);
    const r = await sendWhatsappTemplate(
      chatId,
      templateName,
      lang || "pt_BR",
      clean,
      cfg.phoneNumberId,
    );
    if (!r.ok) {
      return {
        ok: false,
        error: r.error ?? "Não foi possível enviar o template.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao enviar o template." };
  }
}

/** Templates APROVADOS da WABA do agente. Nunca lança: erro → []. */
export async function getApprovedTemplates(
  slug: string,
): Promise<ApprovedTemplate[]> {
  try {
    const cfg = getMetaConfig(slug);
    if (!cfg) return [];
    return await listApprovedTemplates(cfg.wabaId);
  } catch {
    return [];
  }
}
