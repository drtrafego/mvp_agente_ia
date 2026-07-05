// Limpeza best-effort do conteúdo das mensagens antes de renderizar.
// Trata dois casos vindos do Hermes:
//  (a) mensagens de e-mail (role=user) que chegam com o prompt boilerplate do
//      agente e/ou o payload cru da Brevo Inbound (JSON com items/From/...).
//  (b) marcadores de transcrição de voz redundantes.
// WhatsApp já vem limpo e passa direto.

const EMAIL_FALLBACK = "📧 E-mail recebido";

const BOILERPLATE_PATTERNS: RegExp[] = [
  /voc[êe] [ée] o agente de e-?mail/i,
  /you are the email agent/i,
];

export type MediaKind = "audio" | "image" | "video" | "document";
export type MediaItem = { kind: MediaKind; file: string };
export type CleanedMessage = { text: string; media: MediaItem[] };

// Marcador injetado pelo Hermes: [[HMEDIA:<kind>:<filename>]]
const MEDIA_PATTERN =
  /\[\[HMEDIA:(audio|image|video|document):([A-Za-z0-9._-]+)\]\]/g;

export function cleanMessage(
  content: string | null | undefined,
  role: string,
  _channel?: string | null,
): CleanedMessage {
  if (!content) return { text: "", media: [] };

  // Extrai a mídia primeiro e remove os marcadores do texto.
  const { text: withoutMedia, media } = extractMedia(content);

  // (b) tira o wrapper de transcrição de voz, deixa só o que foi dito.
  let text = stripVoiceMarker(withoutMedia);

  // (a) limpeza de e-mail só faz sentido nas mensagens do lead.
  if (role === "user" && looksLikeEmailPayload(text)) {
    return { text: extractEmailBody(text) ?? EMAIL_FALLBACK, media };
  }

  return { text: text.trim(), media };
}

function extractMedia(content: string): { text: string; media: MediaItem[] } {
  const media: MediaItem[] = [];
  const text = content
    .replace(MEDIA_PATTERN, (_m, kind: MediaKind, file: string) => {
      media.push({ kind, file });
      return "";
    })
    // colapsa espaços/linhas em branco deixados pelos marcadores removidos.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, media };
}

function stripVoiceMarker(text: string): string {
  // [The user sent a voice message~ Here's what they said: "..."]
  // e variação em pt: [O usuário enviou um áudio ... disse: "..."]
  // Ancoramos após "said/disse:" e usamos só aspas duplas/curvas como
  // delimitador do transcrito, pra o apóstrofo de "Here's" não confundir.
  const pattern =
    /\[\s*(?:the user sent a voice message|o usu[áa]rio enviou (?:um [áa]udio|uma mensagem de voz))[\s\S]*?(?:said|disse(?:ram)?)\s*:?\s*["“]([\s\S]*?)["”]\s*\]/gi;
  const replaced = text.replace(pattern, (_m, said: string) => said.trim());
  return replaced.trim();
}

function looksLikeEmailPayload(text: string): boolean {
  if (BOILERPLATE_PATTERNS.some((re) => re.test(text))) return true;
  if (/"items"\s*:/.test(text) && /"(?:From|Subject|RawTextBody)"\s*:/.test(text))
    return true;
  if (/"From"\s*:\s*\{/.test(text)) return true;
  return false;
}

function extractEmailBody(text: string): string | null {
  const obj = extractJsonObject(text);
  if (!obj) return null;

  const item =
    obj && Array.isArray(obj.items) && obj.items.length ? obj.items[0] : obj;
  if (!item || typeof item !== "object") return null;

  const fromRaw = item.From ?? obj.From;
  const fromName =
    typeof fromRaw === "object" && fromRaw
      ? fromRaw.Name || fromRaw.Address || null
      : typeof fromRaw === "string"
        ? fromRaw
        : null;

  const subjectRaw = item.Subject ?? obj.Subject;
  const subject = typeof subjectRaw === "string" ? subjectRaw.trim() : null;

  let body = pickBody(item);
  if (body) body = normalizeBody(body);

  const header = [
    fromName ? `De: ${fromName}` : null,
    subject ? `Assunto: ${subject}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (body) {
    return header ? `${header}\n\n${body}` : body;
  }

  // Sem corpo extraível: resumo curto em vez de despejar o JSON.
  if (fromName || subject) {
    return `${EMAIL_FALLBACK}${header ? ` — ${header.replace(/ · /g, " · ")}` : ""}`;
  }
  return null;
}

function pickBody(item: Record<string, unknown>): string | null {
  const textCandidates = [
    item.ExtractedMarkdownMessage,
    item.RawTextBody,
    item.TextBody,
    item.text,
    item.body,
  ];
  for (const c of textCandidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  const html = item.RawHtmlBody ?? item.HtmlBody ?? item.html;
  if (typeof html === "string" && html.trim()) return stripHtml(html);
  return null;
}

function normalizeBody(body: string): string {
  return collapseBlankLines(trimQuotedReply(body)).trim();
}

function trimQuotedReply(body: string): string {
  const markers: RegExp[] = [
    /\n\s*On .+ wrote:/i,
    /\n\s*Em .+ escreveu:/i,
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\n_{5,}/,
  ];
  let cut = body.length;
  for (const re of markers) {
    const m = body.match(re);
    if (m && m.index !== undefined && m.index < cut) cut = m.index;
  }
  return body.slice(0, cut);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

// Varre o primeiro objeto JSON balanceado no texto, respeitando strings/escapes.
function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
