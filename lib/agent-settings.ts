"use server";

import { revalidatePath } from "next/cache";
import { sql } from "./db";
import { assertAgentAccess, getSessionEmail } from "./access";
import { isSuperAdmin } from "./admin";
import { invalidateCatalog } from "./agents";
import { encryptSecret } from "./crypto";

export type SettingsResult = { ok: true } | { ok: false; error: string };

/**
 * Campos editáveis do agente. Slug e schema NÃO estão aqui de propósito: são
 * imutáveis, porque o schema é onde vivem as conversas e para onde o sync do
 * VPS aponta. Trocar qualquer um dos dois quebraria o vínculo com o dado.
 */
export type AgentSettingsInput = {
  name: string;
  persona: string;
  description: string;
  accent: string;
  metaPhoneNumberId: string;
  metaWabaId: string;
  leadSource: string;
  leadSourcePageId: string;
  /** Vazio significa "mantém o token atual", nunca apaga. */
  metaToken: string;
};

const ACCENTS = new Set(["primary", "secondary", "accent"]);
const SOURCES = new Set(["form", "outreach", "none"]);
const SO_DIGITOS = /^\d{5,25}$/;

export async function saveAgentSettings(
  slug: string,
  input: AgentSettingsInput,
): Promise<SettingsResult> {
  // Acesso ao agente primeiro (404 se não puder ver), depois o poder de editar.
  const agent = await assertAgentAccess(slug);

  // Configuração é operação de dono do sistema: o cliente enxerga o painel do
  // agente dele, mas número da Meta, token e fonte de leads não são dele.
  const email = await getSessionEmail();
  if (!isSuperAdmin(email)) {
    return { ok: false, error: "Somente o administrador pode alterar a configuração." };
  }

  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) {
    return { ok: false, error: "O nome precisa ter entre 2 e 60 caracteres." };
  }

  const accent = ACCENTS.has(input.accent) ? input.accent : "primary";
  const leadSource = SOURCES.has(input.leadSource) ? input.leadSource : "none";

  const phone = input.metaPhoneNumberId.trim();
  const waba = input.metaWabaId.trim();
  // O CHECK agents_meta_pair_ck exige os dois preenchidos ou os dois vazios.
  if (!!phone !== !!waba) {
    return {
      ok: false,
      error: "Preencha os dois campos da Meta (phone number id e waba id) ou deixe os dois em branco.",
    };
  }
  if (phone && (!SO_DIGITOS.test(phone) || !SO_DIGITOS.test(waba))) {
    return { ok: false, error: "Os ids da Meta devem conter apenas números." };
  }

  const pageId = input.leadSourcePageId.trim();
  // Espelha o CHECK agents_source_page_ck.
  if (leadSource === "form" && !pageId) {
    return { ok: false, error: "A fonte formulário exige o id da página." };
  }
  if (pageId && !SO_DIGITOS.test(pageId)) {
    return { ok: false, error: "O id da página deve conter apenas números." };
  }

  let cipher: string | null = null;
  const token = input.metaToken.trim();
  if (token) {
    try {
      cipher = encryptSecret(token);
    } catch {
      return {
        ok: false,
        error: "Não foi possível cifrar o token: AGENTS_SECRET_KEY ausente ou inválida no servidor.",
      };
    }
  }

  try {
    await sql`
      update public.agents set
        name                 = ${name},
        persona              = ${input.persona.trim()},
        description          = ${input.description.trim()},
        accent               = ${accent},
        meta_phone_number_id = ${phone || null},
        meta_waba_id         = ${waba || null},
        lead_source          = ${leadSource},
        lead_source_page_id  = ${leadSource === "form" ? pageId : null},
        meta_token_cipher    = coalesce(${cipher}, meta_token_cipher),
        updated_at           = now()
      where id = ${agent.id}
    `;
  } catch (error) {
    console.error("[Agentes] Falha ao salvar configuração:", error);
    return { ok: false, error: "Erro ao salvar a configuração do agente." };
  }

  invalidateCatalog();
  revalidatePath(`/org/${agent.orgSlug}/${agent.slug}`, "layout");
  return { ok: true };
}
