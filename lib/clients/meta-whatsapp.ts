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
};

const GRAPH = "https://graph.facebook.com";

function token(): string | null {
  return process.env.META_ACCESS_TOKEN?.trim() || null;
}

/** Interpreta o corpo de erro da Graph API e detecta a janela de 24h. */
function parseMetaError(errText: string, status: number): {
  message: string;
  outsideWindow: boolean;
} {
  let code: number | undefined;
  let msg = errText;
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
    msg = e.error_user_msg || e.message || errText;
    errText = `${msg} ${e.error_data?.details ?? ""}`;
  } catch {
    // corpo não-JSON: usa o texto cru
  }
  const outsideWindow =
    code === 131047 ||
    /24\s*hours|re-?engage|outside.*window|message.*window|customer care window/i.test(
      errText,
    );
  return {
    message: outsideWindow
      ? "Fora da janela de 24h — use um template aprovado para reengajar."
      : msg?.trim() || `Falha no envio (HTTP ${status}).`,
    outsideWindow,
  };
}

async function postMessage(
  phoneNumberId: string,
  body: Record<string, unknown>,
): Promise<MetaSendResult> {
  const t = token();
  if (!t) {
    return {
      ok: false,
      messageId: "",
      error: "META_ACCESS_TOKEN não configurado no servidor.",
    };
  }
  const to = String(body.to ?? "").replace(/^\+/, "");
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
): Promise<MetaSendResult> {
  return postMessage(phoneNumberId, {
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { body: text },
  });
}

export async function sendWhatsappTemplate(
  phone: string,
  templateName: string,
  lang: string,
  bodyParams: string[],
  phoneNumberId: string,
): Promise<MetaSendResult> {
  return postMessage(phoneNumberId, {
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
  });
}

/** Lista os templates APROVADOS de uma WABA. Best-effort: erro → []. */
export async function listApprovedTemplates(
  wabaId: string,
): Promise<ApprovedTemplate[]> {
  const t = token();
  if (!t || !wabaId) return [];
  const url = `${GRAPH}/${META_GRAPH_VERSION}/${wabaId}/message_templates?fields=name,status,language,category&limit=200`;
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
      }>;
    };
    const list = Array.isArray(data.data) ? data.data : [];
    return list
      .filter((tpl) => tpl.status === "APPROVED" && tpl.name)
      .map((tpl) => ({
        name: tpl.name as string,
        language: tpl.language ?? "pt_BR",
        category: tpl.category ?? "",
      }));
  } catch {
    return [];
  }
}
