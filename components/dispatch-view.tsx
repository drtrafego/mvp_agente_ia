import Link from "next/link";
import { ArrowLeft, MessageCircle, Send, Clock } from "lucide-react";
import type { DispatchDetail, ConvChannel } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";

function fillPreview(body: string, name: string, vars: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, num: string) => {
    const n = Number(num);
    if (n === 1) return name || "{{1}}";
    const v = vars[n - 2];
    return v && v.trim() ? v : `{{${n}}}`;
  });
}

export function DispatchView({
  basePath,
  ch,
  detail,
}: {
  /** Prefixo de rota do agente: /org/<empresa>/<agente>. */
  basePath: string;
  ch: ConvChannel;
  detail: DispatchDetail;
}) {
  const name = detail.full_name ?? detail.phone_norm;
  const reconstructed = detail.body
    ? fillPreview(detail.body, detail.full_name ?? "", detail.vars)
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border glass shadow-soft">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3.5">
        <Link
          href={`${basePath}/conversas?ch=${ch}`}
          scroll={false}
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted transition-colors hover:text-fg lg:hidden"
          aria-label="Voltar"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-3 text-muted">
          <MessageCircle className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold leading-tight">{name}</h2>
          <div className="mt-0.5 text-xs text-muted">
            <span className="tnum truncate">{detail.phone_norm}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {/* mensagem enviada = à direita (nós iniciamos) */}
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-br from-secondary/20 to-accent-2/15 px-3.5 py-2.5 text-sm leading-relaxed text-fg ring-1 ring-inset ring-secondary/25">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-2">
              <Send className="size-3" />
              Enviado por você
            </div>
            {reconstructed ? (
              <p className="whitespace-pre-wrap break-words">{reconstructed}</p>
            ) : (
              <p className="break-words">
                📤 Mensagem enviada
                {detail.template_name ? (
                  <>
                    {" · "}
                    <span className="font-medium">{detail.template_name}</span>
                  </>
                ) : null}
              </p>
            )}
            {detail.sent_at ? (
              <span className="mt-1 block text-[10px] text-muted-2">
                {formatDateTime(detail.sent_at)}
              </span>
            ) : null}
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 py-4 text-center text-xs text-muted-2">
          <Clock className="size-3.5" />
          Aguardando resposta — o lead ainda não respondeu ao disparo.
        </p>
      </div>

      <div className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted-2">
        <Send className="size-3.5" />
        Disparo de template (1º toque). A conversa abre aqui quando o lead
        responder.
      </div>
    </div>
  );
}
