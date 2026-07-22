import "server-only";
import { revalidatePath } from "next/cache";
import { sql } from "./db";
import type { Agent } from "./agents";
import { getMetaConfig, getMetaToken } from "./meta-config";
import { sendWhatsappTemplate } from "./clients/meta-whatsapp";

/**
 * Caminho INTERNO do disparo em massa.
 *
 * Este arquivo NÃO tem "use server" de propósito: nada aqui é exposto como
 * endpoint de server action. Ele recebe o agente JÁ RESOLVIDO e não checa
 * sessão, porque também roda pelo cron (lib/dispatch-runner.ts), que não tem
 * usuário logado. Quem checa acesso é a server action pública equivalente em
 * lib/actions.ts, que chama assertAgentAccess antes de delegar para cá.
 *
 * Regra: nunca exportar isto de um módulo com "use server".
 */

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
export async function sendTemplateToLeadsInternal(
  agent: Agent,
  targets: OutreachTarget[],
  templateName: string,
  lang: string,
  sharedParams: string[] = [],
  varCount = 0,
): Promise<OutreachSummary> {
  const slug = agent.slug;
  const fail = (error: string): OutreachSummary => ({
    ok: false,
    enviados: 0,
    falhas: 0,
    resultados: [],
    error,
  });
  try {
    const cfg = getMetaConfig(agent);
    if (!cfg)
      return fail("Este agente não tem número de WhatsApp oficial configurado.");
    const token = getMetaToken(agent);
    if (!token)
      return fail("Este agente não tem número de WhatsApp oficial configurado.");
    if (!templateName) return fail("Selecione um template.");
    if (!Array.isArray(targets) || targets.length === 0)
      return fail("Nenhum lead selecionado.");

    // {{1}} = nome do lead (por lead); {{2}}..{{n}} = compartilhados.
    const shared = sharedParams.map((p) => p.trim());
    if (varCount > 1 && shared.length < varCount - 1) {
      return fail(
        `Preencha as ${varCount - 1} variáveis compartilhadas do template.`,
      );
    }
    const sharedForTemplate = varCount > 1 ? shared.slice(0, varCount - 1) : [];

    try {
      await ensureOutreachTable();
    } catch {
      // se não der pra criar a tabela, segue o envio mesmo sem rastreio
    }

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

      // Monta bodyParams por lead: [nome, ...compartilhados]. Sem variáveis → [].
      const bodyParams =
        varCount === 0
          ? []
          : [name.trim() || "tudo bem", ...sharedForTemplate];

      const r = await sendWhatsappTemplate(
        phone,
        templateName,
        lang || "pt_BR",
        bodyParams,
        cfg.phoneNumberId,
        token,
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

    revalidatePath(`/org/${agent.orgSlug}/${slug}/leads`);
    return { ok: true, enviados, falhas, resultados };
  } catch {
    return fail("Erro inesperado no disparo.");
  }
}
