import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * Faixa fixa no topo de TODAS as telas do agente enquanto o bot inteiro estiver
 * pausado. Existe porque pausar e esquecer é o risco real: sem um aviso que
 * acompanha o operador em qualquer tela, o bot fica mudo e ninguém percebe.
 */
export function GlobalPauseBanner({
  agentName,
  settingsHref,
}: {
  agentName: string;
  settingsHref: string;
}) {
  return (
    <div
      role="alert"
      className="border-b border-destructive/40 bg-destructive/15 px-4 py-2.5 sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-[#f87171]">
          <ShieldAlert className="size-4 shrink-0" />
          Bot pausado
        </span>
        <span className="text-fg">
          {agentName} não está respondendo nenhum lead, e o follow-up está
          parado.
        </span>
        <Link
          href={settingsHref}
          className="ml-auto shrink-0 rounded-md font-semibold text-[#f87171] underline underline-offset-2 transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
        >
          Retomar o bot
        </Link>
      </div>
    </div>
  );
}
