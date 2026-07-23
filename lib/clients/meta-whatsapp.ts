import "server-only";
import { META_GRAPH_VERSION } from "../meta-config";

export type MetaSendResult = {
  ok: boolean;
  messageId: string;
  error?: string;
  /** true quando a Meta recusou por estar fora da janela de 24h. */
  outsideWindow?: boolean;
};

export type ApprovedTemplate = {
  name: string;
  language: string;
  category: string;
  /** Texto do corpo (componente BODY), com placeholders {{n}}. */
  body: string;
  /** Quantidade de variáveis {{n}} no corpo (maior n encontrado). */
  varCount: number;
};

type TemplateComponent = {
  type?: string;
  text?: string;
};

/** Conta variáveis {{n}} pegando o maior índice presente no texto. */
function countVars(text: string): number {
  let max = 0;
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

const GRAPH = "https://graph.facebook.com";

/**
 * Normaliza o destinatário para o formato que a Cloud API exige: só dígitos,
 * sem "+", sem "@c.us", sem espaços (E.164 sem o sinal). Conversas de teste/
 * simulação guardam um rótulo em vez de telefone; isso vira dígitos insuficientes
 * e é barrado antes de chamar a Graph (senão a Meta devolve 131009).
 */
function normalizeRecipient(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/** Interpreta o corpo de erro da Graph API e detecta a janela de 24h. */
function parseMetaError(errText: string, status: number): {
  message: string;
  outsideWindow: boolean;
} {
  let code: number | undefined;
  let msg = errText;
  let details = "";
  try {
    const j = JSON.parse(errText) as {
      error?: {
        code?: number;
        message?: string;
        error_user_msg?: string;
        error_data?: { details?: string };
      };
    };
    const e = j.error ?? {};
    code = e.code;
    details = e.error_data?.details ?? "";
    msg = e.error_user_msg || e.message || errText;
    errText = `${msg} ${details}`;
  } catch {
    // corpo não-JSON: usa o texto cru
  }
  const outsideWindow =
    code === 131047 ||
    /24\s*hours|re-?engage|outside.*window|message.*window|customer care window/i.test(
      errText,
    );

  // Mensagens amigáveis para os erros que o dono via como texto cru da Meta.
  let message: string;
  if (outsideWindow) {
    message = "Fora da janela de 24h — use um template aprovado para reengajar.";
  } else if (code === 131009) {
    message =
      "Contato sem número de WhatsApp válido (parece uma conversa de teste). " +
      "Só dá para responder conversas com telefone real.";
  } else if (code === 131058) {
    message =
      "O template hello_world só pode ser enviado por números de teste. " +
      "Crie e aprove um template próprio na Meta (Business Manager) para reengajar.";
  } else {
    // Anexa o error_data.details da Meta, que diz QUAL parâmetro falhou.
    const base = msg?.trim() || `Falha no envio (HTTP ${status}).`;
    message = details.trim() ? `${base} — ${details.trim()}` : base;
  }
  return { message, outsideWindow };
}

async function postMessage(
  phoneNumberId: string,
  body: Record<string, unknown>,
  token: string | null,
): Promise<MetaSendResult> {
  const t = token;
  if (!t) {
    return {
      ok: false,
      messageId: "",
      error: "Token da Meta não configurado para este agente.",
    };
  }
  const to = normalizeRecipient(body.to);
  // wa_id válido tem entre 8 e 15 dígitos. Rótulo de conversa de teste ou
  // contato sem telefone real cai aqui e recebe uma mensagem clara, em vez do
  // 131009 ("Parameter value is not valid") cru da Meta.
  if (to.length < 8 || to.length > 15) {
    return {
      ok: false,
      messageId: "",
      error:
        "Contato sem número de WhatsApp válido (parece uma conversa de teste). " +
        "Só dá para enviar para conversas com telefone real.",
    };
  }
  const url = `${GRAPH}/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, to }),
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const { message, outsideWindow } = parseMetaError(errText, res.status);
      return { ok: false, messageId: "", error: message, outsideWindow };
    }
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
    };
    return { ok: true, messageId: data?.messages?.[0]?.id ?? "" };
  } catch {
    return {
      ok: false,
      messageId: "",
      error: "Falha de rede ao contatar a API da Meta.",
    };
  }
}

export async function sendWhatsappText(
  phone: string,
  text: string,
  phoneNumberId: string,
  token: string | null,
): Promise<MetaSendResult> {
  return postMessage(
    phoneNumberId,
    {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: text },
    },
    token,
  );
}

export async function sendWhatsappTemplate(
  phone: string,
  templateName: string,
  lang: string,
  bodyParams: string[],
  phoneNumberId: string,
  token: string | null,
): Promise<MetaSendResult> {
  return postMessage(
    phoneNumberId,
    {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: lang },
        components: bodyParams.length
          ? [
              {
                type: "body",
                parameters: bodyParams.map((t) => ({ type: "text", text: t })),
              },
            ]
          : [],
      },
    },
    token,
  );
}

/** Lista os templates APROVADOS de uma WABA. Best-effort: erro → []. */
export async function listApprovedTemplates(
  wabaId: string,
  token: string | null,
): Promise<ApprovedTemplate[]> {
  const t = token;
  if (!t || !wabaId) return [];
  const url = `${GRAPH}/${META_GRAPH_VERSION}/${wabaId}/message_templates?fields=name,status,language,category,components&limit=200`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json().catch(() => ({}))) as {
      data?: Array<{
        name?: string;
        status?: string;
        language?: string;
        category?: string;
        components?: TemplateComponent[];
      }>;
    };
    const list = Array.isArray(data.data) ? data.data : [];
    return list
      // hello_world é o template demo da Meta: só pode ser enviado de números
      // de teste (erro 131058 em número de produção). Some da lista para não
      // induzir o dono a um envio que sempre falha.
      .filter((tpl) => tpl.status === "APPROVED" && tpl.name && tpl.name !== "hello_world")
      .map((tpl) => {
        const bodyComp = (tpl.components ?? []).find(
          (c) => (c.type ?? "").toUpperCase() === "BODY",
        );
        const body = bodyComp?.text ?? "";
        return {
          name: tpl.name as string,
          language: tpl.language ?? "pt_BR",
          category: tpl.category ?? "",
          body,
          varCount: countVars(body),
        };
      });
  } catch {
    return [];
  }
}
