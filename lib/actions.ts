"use server";

import { revalidatePath } from "next/cache";
import { getAgent } from "./agents";

const BASE_URL =
  process.env.HERMES_PANEL_URL ?? "https://hermes.casaldotrafego.com/agente";

export type ActionResult = { ok: boolean; error?: string };

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

export async function sendReplyAction(
  slug: string,
  chatId: string | null,
  texto: string,
): Promise<ActionResult> {
  if (!getAgent(slug)) return { ok: false, error: "Agente desconhecido." };
  if (!chatId) return { ok: false, error: "Conversa sem contato vinculado." };
  const msg = texto.trim();
  if (!msg) return { ok: false, error: "Digite uma mensagem." };

  const res = await callPanel("/api/responder", {
    method: "POST",
    body: JSON.stringify({ agente: slug, chat_id: chatId, texto: msg }),
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath(`/${slug}/conversas`);
  return { ok: true };
}
