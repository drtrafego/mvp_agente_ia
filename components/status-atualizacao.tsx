"use client";

import * as React from "react";
import { formatNumber } from "@/lib/utils";
import type { MotivoFalha } from "@/lib/use-atualizacao-automatica";

export type InfoConversas = {
  /** Total de itens na aba, contado no CLIENTE: precisa mudar sozinho. */
  total: number;
  ultimaAtualizacao: Date | null;
  atualizando: boolean;
  falhasSeguidas: number;
  /** Causa da última falha, para o indicador não chamar tudo de "sem conexão". */
  motivo: MotivoFalha | null;
  atualizarAgora: () => void;
};

/**
 * O board publica aqui o estado da atualização automática, e o cabeçalho (que
 * é montado no SERVIDOR e entregue como `header`) consome. Funciona porque o
 * board renderiza esse header dentro da própria árvore dele.
 */
export const ConversasContexto = React.createContext<InfoConversas | null>(null);

function horaCurta(d: Date): string {
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Contador da aba + prova de que a tela está viva.
 *
 * Deliberadamente discreto: a atualização de fundo é SILENCIOSA (nada de
 * spinner por cima da tela a cada ciclo). O que a pessoa precisa é confiar que
 * está vendo o agora, e para isso basta o horário.
 */
export function StatusAtualizacao() {
  const info = React.useContext(ConversasContexto);
  if (!info) return null;

  const { total, ultimaAtualizacao, atualizando, falhasSeguidas, motivo } = info;
  const caiu = falhasSeguidas > 0;

  // ‼️ Sessão vencida ganhou estado próprio (01/09/2026). Antes caía no mesmo
  // "sem conexão" da queda de rede, e a pessoa ficava esperando a internet
  // voltar em vez de entrar de novo. Clicar aqui não adianta: o que resolve é
  // o login, então o controle vira link.
  if (caiu && motivo === "sessao") {
    return (
      <a
        href="/handler/sign-in"
        title="Sua sessão venceu. Entre de novo para voltar a ver as conversas de agora."
        className="flex shrink-0 items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
      >
        <span className="tnum">{formatNumber(total)} nesta aba</span>
        <span className="font-medium text-[#f0a35e] underline decoration-dotted underline-offset-2">
          · sessão expirada, entrar de novo
        </span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={info.atualizarAgora}
      title={
        caiu
          ? "Sem conexão com o servidor. Tentando de novo sozinho, clique para tentar agora."
          : "A tela se atualiza sozinha. Clique para atualizar agora."
      }
      className="group flex shrink-0 items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
    >
      <span className="tnum">{formatNumber(total)} nesta aba</span>
      {caiu ? (
        <span className="text-[#f0a35e]">· sem conexão, tentando de novo</span>
      ) : ultimaAtualizacao ? (
        <>
          <span
            aria-hidden
            className={`size-1.5 rounded-full bg-accent transition-opacity duration-300 ${
              atualizando ? "opacity-100" : "opacity-40"
            }`}
          />
          <span className="tnum text-muted-2">
            atualizado às {horaCurta(ultimaAtualizacao)}
          </span>
        </>
      ) : null}
    </button>
  );
}
