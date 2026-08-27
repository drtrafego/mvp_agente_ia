"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar, ChevronLeft, ChevronRight, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import {
  PRESETS,
  addDays,
  daysInRange,
  isCustom,
  periodLabel,
  serializePeriod,
  todayLocal,
  type Period,
  type PeriodPreset,
} from "@/lib/periodo";

/**
 * Seletor de período no estilo Google Ads: presets à esquerda, dois meses
 * lado a lado, seleção de intervalo por clique, e Aplicar/Cancelar.
 *
 * Escrito à mão de propósito: o projeto não tem react-day-picker, e um
 * calendário de dois meses é pouca coisa comparado a mais uma dependência.
 * Toda conta de data acontece em AAAA-MM-DD (string), nunca em Date local,
 * pra não reintroduzir o bug de fuso que zerava o "Hoje" (ver lib/periodo.ts).
 */

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Grade de 6 semanas do mês, com os buracos como null. */
function gradeDoMes(ano: number, mes: number): (string | null)[] {
  const primeiro = new Date(Date.UTC(ano, mes, 1));
  const inicio = primeiro.getUTCDay();
  const total = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const out: (string | null)[] = Array(inicio).fill(null);
  for (let d = 1; d <= total; d++) {
    out.push(
      `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
  }
  while (out.length % 7 !== 0) out.push(null);
  return out;
}

function Mes({
  ano,
  mes,
  from,
  to,
  hover,
  hoje,
  onPick,
  onHover,
}: {
  ano: number;
  mes: number;
  from: string | null;
  to: string | null;
  hover: string | null;
  hoje: string;
  onPick: (d: string) => void;
  onHover: (d: string | null) => void;
}) {
  const dias = gradeDoMes(ano, mes);
  // enquanto só a primeira ponta existe, o hover pré-visualiza o intervalo
  const fim = to ?? (from && hover && hover > from ? hover : to);

  return (
    <div className="w-full min-w-[15rem] sm:w-[15.5rem]">
      <div className="mb-2 text-center text-sm font-semibold text-fg">
        {MESES[mes]} {ano}
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-[0.65rem] font-medium text-muted">
        {DIAS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {dias.map((dia, i) => {
          if (!dia) return <span key={i} />;
          const futuro = dia > hoje;
          const isFrom = dia === from;
          const isTo = dia === fim;
          const dentro = !!from && !!fim && dia > from && dia < fim;
          const ponta = isFrom || isTo;
          return (
            <button
              key={i}
              type="button"
              disabled={futuro}
              onClick={() => onPick(dia)}
              onMouseEnter={() => onHover(dia)}
              className={[
                "relative h-9 text-xs transition-colors sm:h-8",
                futuro
                  ? "cursor-not-allowed text-muted/40"
                  : "cursor-pointer hover:bg-surface-2",
                dentro ? "bg-primary/15 text-fg" : "",
                ponta ? "brand-gradient font-semibold text-white" : "",
                isFrom && fim && fim !== from ? "rounded-l-md" : "",
                isTo && from && fim !== from ? "rounded-r-md" : "",
                ponta && fim === from ? "rounded-md" : "",
                !ponta && !dentro ? "rounded-md" : "",
                dia === hoje && !ponta
                  ? "font-semibold underline decoration-primary underline-offset-4"
                  : "",
              ].join(" ")}
            >
              {Number(dia.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * O mês que fica na COLUNA DA ESQUERDA. A direita é sempre o seguinte, então a
 * esquerda tem que ser o mês ANTERIOR ao de referência: senão a direita cai no
 * mês que vem, inteiro desabilitado, e o calendário nasce inútil.
 */
function mesEsquerda(period: Period, hoje: string) {
  const base = isCustom(period) ? period.to : hoje;
  const ano = Number(base.slice(0, 4));
  const mes = Number(base.slice(5, 7)) - 1;
  return mes === 0 ? { ano: ano - 1, mes: 11 } : { ano, mes: mes - 1 };
}

export function DateRangePicker({
  period,
  basePath,
}: {
  period: Period;
  basePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hoje = todayLocal();

  const [aberto, setAberto] = React.useState(false);
  const [from, setFrom] = React.useState<string | null>(null);
  const [to, setTo] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<string | null>(null);
  // mês da ESQUERDA; o da direita é sempre o seguinte
  const [cursor, setCursor] = React.useState(() => mesEsquerda(period, hoje));

  // ao abrir, parte do que já está aplicado
  React.useEffect(() => {
    if (!aberto) return;
    if (isCustom(period)) {
      setFrom(period.from);
      setTo(period.to);
      setCursor(mesEsquerda(period, hoje));
    } else {
      setFrom(null);
      setTo(null);
      setCursor(mesEsquerda(hoje as unknown as Period, hoje));
    }
    setHover(null);
  }, [aberto, period, hoje]);

  function irPara(p: Period) {
    const q = new URLSearchParams(params?.toString() ?? "");
    q.set("p", serializePeriod(p));
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
    setAberto(false);
  }

  function clicar(dia: string) {
    // 1º clique abre o intervalo, 2º fecha. Clicar antes do início recomeça.
    if (!from || (from && to) || dia < from) {
      setFrom(dia);
      setTo(null);
      return;
    }
    setTo(dia);
  }

  const podeAplicar = !!from;
  const selecionado = from ? { from, to: to ?? from } : null;
  const mesDireita =
    cursor.mes === 11
      ? { ano: cursor.ano + 1, mes: 0 }
      : { ano: cursor.ano, mes: cursor.mes + 1 };
  // não deixa navegar pra frente além do mês corrente na coluna da direita
  const noFuturo =
    mesDireita.ano > Number(hoje.slice(0, 4)) ||
    (mesDireita.ano === Number(hoje.slice(0, 4)) &&
      mesDireita.mes >= Number(hoje.slice(5, 7)) - 1);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-2/60 px-4 py-2 text-xs font-medium text-fg transition-colors hover:bg-surface-2 sm:w-auto"
        >
          <Calendar className="size-3.5 text-muted" />
          {periodLabel(period)}
          <ChevronRight className="size-3.5 rotate-90 text-muted" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] border-border bg-surface p-0 sm:w-auto sm:max-w-none"
      >
        <div className="flex flex-col sm:flex-row">
          {/* presets */}
          <div className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-border p-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:w-48 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r [&::-webkit-scrollbar]:hidden">
            {PRESETS.map((p) => {
              const ativo = !isCustom(period) && period === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => irPara(p.key as PeriodPreset)}
                  className={`whitespace-nowrap rounded-md px-3 py-2 text-left text-xs transition-colors sm:py-1.5 ${
                    ativo
                      ? "brand-gradient font-medium text-white"
                      : "text-muted hover:bg-surface-2 hover:text-fg"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* calendários */}
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() =>
                  setCursor((c) =>
                    c.mes === 0
                      ? { ano: c.ano - 1, mes: 11 }
                      : { ano: c.ano, mes: c.mes - 1 },
                  )
                }
                className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-[0.65rem] uppercase tracking-wider text-muted">
                {selecionado
                  ? `${daysInRange(selecionado.from, selecionado.to)} dia${
                      daysInRange(selecionado.from, selecionado.to) > 1 ? "s" : ""
                    } selecionado${
                      daysInRange(selecionado.from, selecionado.to) > 1 ? "s" : ""
                    }`
                  : "Clique no início e no fim"}
              </span>
              <button
                type="button"
                aria-label="Próximo mês"
                disabled={noFuturo}
                onClick={() =>
                  setCursor((c) =>
                    c.mes === 11
                      ? { ano: c.ano + 1, mes: 0 }
                      : { ano: c.ano, mes: c.mes + 1 },
                  )
                }
                className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div
              className="flex justify-center gap-5"
              onMouseLeave={() => setHover(null)}
            >
              <div className="hidden sm:block">
                <Mes
                  ano={cursor.ano}
                  mes={cursor.mes}
                  from={from}
                  to={to}
                  hover={hover}
                  hoje={hoje}
                  onPick={clicar}
                  onHover={setHover}
                />
              </div>
              <Mes
                ano={mesDireita.ano}
                mes={mesDireita.mes}
                from={from}
                to={to}
                hover={hover}
                hoje={hoje}
                onPick={clicar}
                onHover={setHover}
              />
            </div>

            <div className="mt-3 flex flex-col items-stretch gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="text-center text-xs text-muted sm:text-left">
                {selecionado
                  ? `${selecionado.from.split("-").reverse().join("/")} até ${selecionado.to
                      .split("-")
                      .reverse()
                      .join("/")}`
                  : periodLabel(period)}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="flex-1 rounded-md px-3 py-2 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:flex-none sm:py-1.5"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!podeAplicar}
                  onClick={() =>
                    selecionado &&
                    irPara({ from: selecionado.from, to: selecionado.to })
                  }
                  className="brand-gradient flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:py-1.5"
                >
                  <Check className="size-3.5" />
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Atalho pra "ontem", usado nas telas que não abrem o calendário inteiro. */
export const ONTEM = addDays(todayLocal(), -1);
