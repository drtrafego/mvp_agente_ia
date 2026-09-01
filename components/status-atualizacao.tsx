"use client";

import * as React from "react";
import { formatNumber } from "@/lib/utils";

export type InfoConversas = {
  /** Total de itens na aba, contado no CLIENTE: precisa mudar sozinho. */
  total: number;
  ultimaAtualizacao: Date | null;
  atualizando: boolean;
  falhasSeguidas: number;
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

  const { total, ultimaAtualizacao, atualizando, falhasSeguidas } = info;
  const caiu = falhasSeguidas > 0;

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
