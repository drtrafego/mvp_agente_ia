"use server";

import { revalidatePath } from "next/cache";
import { sql } from "./db";
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

// ---- Disparo de template em massa (outreach) ------------------------

export type OutreachTarget = { phone: string; name: string };
export type OutreachResult = {
  phone: string;
  name: string;
  ok: boolean;
  error?: string;
};
export type OutreachSummary = {
  ok: boolean;
  enviados: number;
  falhas: number;
  resultados: OutreachResult[];
  error?: string;
};

async function ensureOutreachTable(): Promise<void> {
  await sql.unsafe(
    `create table if not exists public.outreach_sent (
       id text primary key,
       agent_slug text,
       phone_norm text,
       lead_name text,
       template_name text,
       sent_at timestamptz default now(),
       status text,
       message_id text,
       error text
     )`,
  );
  await sql.unsafe(
    `create index if not exists outreach_sent_agent_phone_idx
       on public.outreach_sent (agent_slug, phone_norm)`,
  );
}

/**
 * Dispara um template aprovado para uma lista de leads (1º toque em quem
 * preencheu o form mas não conversou). Envio direto pela Meta, com delay entre
 * mensagens; grava cada resultado em public.outreach_sent. Nunca lança 500.
 */
export async function sendTemplateToLeads(
  slug: string,
  targets: OutreachTarget[],
  templateName: string,
  lang: string,
  params: string[] = [],
): Promise<OutreachSummary> {
  const fail = (error: string): OutreachSummary => ({
    ok: false,
    enviados: 0,
    falhas: 0,
    resultados: [],
    error,
  });
  try {
    if (!getAgent(slug)) return fail("Agente desconhecido.");
    const cfg = getMetaConfig(slug);
    if (!cfg)
      return fail("Este agente não tem número de WhatsApp oficial configurado.");
    if (!templateName) return fail("Selecione um template.");
    if (!Array.isArray(targets) || targets.length === 0)
      return fail("Nenhum lead selecionado.");

    try {
      await ensureOutreachTable();
    } catch {
      // se não der pra criar a tabela, segue o envio mesmo sem rastreio
    }

    const clean = params.map((p) => p.trim()).filter(Boolean);
    const resultados: OutreachResult[] = [];
    let enviados = 0;
    let falhas = 0;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const name = t?.name ?? "";
      const phone = (t?.phone ?? "").replace(/\D/g, "");
      if (!phone) {
        falhas++;
        resultados.push({ phone: t?.phone ?? "", name, ok: false, error: "Telefone inválido." });
        continue;
      }

      const r = await sendWhatsappTemplate(
        phone,
        templateName,
        lang || "pt_BR",
        clean,
        cfg.phoneNumberId,
      );

      const id = `${slug}:${phone}:${Date.now()}:${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      try {
        await sql.unsafe(
          `insert into public.outreach_sent
             (id, agent_slug, phone_norm, lead_name, template_name, status, message_id, error)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            slug,
            phone,
            name || null,
            templateName,
            r.ok ? "sent" : "failed",
            r.messageId || null,
            r.ok ? null : r.error ?? null,
          ],
        );
      } catch {
        // rastreio é best-effort; não interrompe o disparo
      }

      if (r.ok) {
        enviados++;
        resultados.push({ phone, name, ok: true });
      } else {
        falhas++;
        resultados.push({ phone, name, ok: false, error: r.error });
      }

      if (i < targets.length - 1) {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }

    revalidatePath(`/${slug}/leads`);
    return { ok: true, enviados, falhas, resultados };
  } catch {
    return fail("Erro inesperado no disparo.");
  }
}
