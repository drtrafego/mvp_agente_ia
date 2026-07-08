import Link from "next/link";
import { ArrowLeft, Mail, MessageCircle, Building2, Send } from "lucide-react";
import type { OutreachConvo, OutreachMsg, ConvChannel } from "@/lib/queries";
import { Badge } from "./ui";
import { formatDateTime } from "@/lib/utils";

export function OutreachChat({
  slug,
  ch,
  convo,
  messages,
}: {
  slug: string;
  ch: ConvChannel;
  convo: OutreachConvo;
  messages: OutreachMsg[];
}) {
  const isEmail = convo.channel === "email";
  const name = convo.lead_name ?? convo.lead_handle ?? "Lead";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border glass shadow-soft">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3.5">
        <Link
          href={`/${slug}/conversas?ch=${ch}`}
          scroll={false}
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted transition-colors hover:text-fg lg:hidden"
          aria-label="Voltar"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-semibold">{name}</h2>
            <Badge tone="violet" className="shrink-0">
              Prospecção
            </Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              {isEmail ? (
                <Mail className="size-3.5" />
              ) : (
                <MessageCircle className="size-3.5" />
              )}
              <span className="tnum truncate">
                {convo.lead_handle ?? "sem contato"}
              </span>
            </span>
            {convo.lead_company ? (
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3.5" />
                <span className="truncate">{convo.lead_company}</span>
              </span>
            ) : null}
            {convo.status ? (
              <span className="text-muted-2">· {convo.status}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-2">
            Nenhuma mensagem registrada nesta prospecção.
          </p>
        ) : (
          messages.map((m) => (
            <OutreachBubble key={m.id} message={m} isEmail={isEmail} />
          ))
        )}
      </div>

      <div className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted-2">
        <Send className="size-3.5" />
        Histórico de prospecção (somente leitura)
      </div>
    </div>
  );
}

function OutreachBubble({
  message,
  isEmail,
}: {
  message: OutreachMsg;
  isEmail: boolean;
}) {
  const outbound = message.direction === "outbound";
  return (
    <div
      className={`flex ${outbound ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          outbound
            ? "rounded-br-sm bg-gradient-to-br from-secondary/20 to-accent-2/15 text-fg ring-1 ring-inset ring-secondary/25"
            : "rounded-bl-sm bg-surface-2 text-fg"
        }`}
      >
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-2">
          {outbound ? "Enviado" : "Resposta do lead"}
        </div>
        {isEmail && message.subject ? (
          <p className="mb-1 font-semibold text-fg">{message.subject}</p>
        ) : null}
        <p className="whitespace-pre-wrap break-words">
          {message.body ?? ""}
        </p>
        {message.sent_at ? (
          <span className="mt-1 block text-[10px] text-muted-2">
            {formatDateTime(message.sent_at)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
