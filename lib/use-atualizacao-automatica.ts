"use client";

import * as React from "react";

/**
 * INTERVALO DA ATUALIZAÇÃO AUTOMÁTICA.
 *
 * ⚠️ 01/09/2026, medido antes de escolher o número. O painel não pode ser mais
 * fresco que o dado que ele lê, e o dado chega em RAJADA:
 * `hermes/central-db/run-sync.sh` copia state.db -> Postgres de 15 em 15
 * minutos (era de 3 em 3 e foi espaçado em 30/08 porque queimava a CPU do
 * servidor). Ou seja, entre uma rajada e outra NADA muda no banco.
 *
 * Latência total que a pessoa sente = sync + este intervalo:
 *   6 min (o palpite inicial): 21 min no pior caso, 10,5 min na média
 *   2 min (este):              17 min no pior caso,  8,5 min na média
 *   1 min:                     16 min no pior caso,  8,0 min na média
 *
 * De 6 para 2 minutos ganha 19% de frescor. De 2 para 1 ganha mais 6% pelo
 * DOBRO das requisições: não paga. Por isso 2 minutos, e não menos.
 *
 * Quem manda na latência é o sync de 15 min, não este número. Para atendimento
 * de verdade ao vivo, o que precisa mudar é o sync, não o polling.
 */
export const INTERVALO_ATUALIZACAO_MS = 2 * 60 * 1000;

/** Teto do recuo progressivo quando a rede cai: nunca martelar o servidor. */
const TETO_RECUO_MS = 10 * 60 * 1000;

/** Um ciclo que trava não pode segurar o próximo pra sempre. */
const TIMEOUT_CICLO_MS = 20 * 1000;

/**
 * Por que o ciclo falhou. A tela precisa da diferença: "sem conexão" e "sessão
 * expirada" pedem coisas diferentes da pessoa, e chamar a segunda de primeira
 * fazia o atendente esperar a internet voltar em vez de entrar de novo.
 */
export type MotivoFalha = "rede" | "sessao";

export type EstadoAtualizacao = {
  /** Quando o último ciclo deu certo. `null` antes do primeiro. */
  ultimaAtualizacao: Date | null;
  atualizando: boolean;
  /** Zera no primeiro sucesso. Alimenta o recuo progressivo e o aviso na tela. */
  falhasSeguidas: number;
  /** Causa da última falha. `null` enquanto está tudo certo. */
  motivo: MotivoFalha | null;
  /** Dispara um ciclo agora (clique no indicador, por exemplo). */
  atualizarAgora: () => void;
};

/**
 * Atualização automática de tela com três cuidados que um setInterval não tem:
 *
 * 1. Corrente de setTimeout, não setInterval: um ciclo lento nunca empilha em
 *    cima do próximo.
 * 2. Aba escondida não gasta requisição (`visibilitychange`), e voltar pra aba
 *    dispara um ciclo IMEDIATO, senão a pessoa volta e olha dado velho.
 * 3. Falha não quebra a tela: o dado anterior fica, e o próximo ciclo espera o
 *    dobro do anterior (1x, 2x, 4x, 8x, com teto). Um sucesso zera tudo.
 */
export function useAtualizacaoAutomatica({
  intervaloMs = INTERVALO_ATUALIZACAO_MS,
  aoAtualizar,
  ativo = true,
}: {
  intervaloMs?: number;
  /** Recebe um sinal de abort: use no fetch para o ciclo poder ser cancelado. */
  aoAtualizar: (sinal: AbortSignal) => Promise<void>;
  ativo?: boolean;
}): EstadoAtualizacao {
  const [estado, setEstado] = React.useState<{
    ultimaAtualizacao: Date | null;
    atualizando: boolean;
    falhasSeguidas: number;
    motivo: MotivoFalha | null;
  }>({
    ultimaAtualizacao: null,
    atualizando: false,
    falhasSeguidas: 0,
    motivo: null,
  });

  // A função vive numa ref pra trocar de identidade sem reiniciar a corrente:
  // ela depende da conversa aberta, que muda a toda hora.
  const fnRef = React.useRef(aoAtualizar);
  React.useEffect(() => {
    fnRef.current = aoAtualizar;
  }, [aoAtualizar]);

  const forcarRef = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    if (!ativo) return;

    let vivo = true;
    let rodando = false;
    let falhas = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controle: AbortController | null = null;

    function agendar(ms: number) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void executar();
      }, ms);
    }

    /** Espera até a próxima tentativa: 1x, 2x, 4x, 8x o intervalo, com teto. */
    function recuo(): number {
      return Math.min(intervaloMs * 2 ** Math.min(falhas, 3), TETO_RECUO_MS);
    }

    function anotarFalha(motivo: MotivoFalha) {
      falhas += 1;
      if (vivo) {
        setEstado((e) => ({
          ...e,
          atualizando: false,
          falhasSeguidas: falhas,
          motivo,
        }));
      }
    }

    async function executar() {
      if (!vivo || rodando) return;
      // Aba escondida é pausa de verdade: ninguém está olhando, e voltar pra
      // aba dispara um ciclo na hora. Não é falha, não conta.
      if (document.visibilityState !== "visible") {
        agendar(intervaloMs);
        return;
      }
      // ‼️ Sem rede, NÃO gasta requisição mas CONTA como falha. Antes saía
      // calado por aqui: `ultimaAtualizacao` ficava parada, `falhasSeguidas`
      // ficava em 0, e a tela seguia exibindo "atualizado às 14:32" enquanto o
      // dado envelhecia sem ninguém avisar. O carimbo de frescor tem que
      // CALAR quando não sabe, nunca mentir.
      if (navigator.onLine === false) {
        anotarFalha("rede");
        agendar(recuo());
        return;
      }

      rodando = true;
      setEstado((e) => ({ ...e, atualizando: true }));
      controle = new AbortController();
      const corta = setTimeout(() => controle?.abort(), TIMEOUT_CICLO_MS);
      try {
        await fnRef.current(controle.signal);
        falhas = 0;
        if (vivo) {
          setEstado({
            ultimaAtualizacao: new Date(),
            atualizando: false,
            falhasSeguidas: 0,
            motivo: null,
          });
        }
      } catch (e) {
        // Ciclo perdido NÃO limpa a tela: o dado anterior continua valendo, e o
        // indicador diz o que houve. Quem lança SessaoExpirada é o board.
        anotarFalha(
          (e as { name?: string } | null)?.name === "SessaoExpirada"
            ? "sessao"
            : "rede",
        );
      } finally {
        clearTimeout(corta);
        controle = null;
        rodando = false;
        if (vivo) agendar(recuo());
      }
    }

    function aoVisibilidade() {
      if (document.visibilityState !== "visible") return;
      // ‼️ Com o servidor no chão, trocar de aba não pode cancelar o recuo:
      // `agendar(0)` a cada volta virava uma requisição imediata num servidor
      // que já está caído. Sem falha nenhuma, atualiza na hora, que é o ponto
      // do recurso.
      agendar(falhas === 0 ? 0 : recuo());
    }

    function aoConectar() {
      // A rede mudou de estado de verdade: tentar na hora é o certo.
      agendar(0);
    }

    agendar(intervaloMs);
    document.addEventListener("visibilitychange", aoVisibilidade);
    window.addEventListener("online", aoConectar);
    forcarRef.current = () => agendar(0);

    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      controle?.abort();
      document.removeEventListener("visibilitychange", aoVisibilidade);
      window.removeEventListener("online", aoConectar);
      forcarRef.current = () => {};
    };
  }, [ativo, intervaloMs]);

  const atualizarAgora = React.useCallback(() => forcarRef.current(), []);

  return { ...estado, atualizarAgora };
}
