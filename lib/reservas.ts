import "server-only";
import postgres from "postgres";
import { resolveRange, type Period } from "./periodo";

/**
 * Reservas do restaurante, lidas DIRETO do banco dele.
 *
 * ⚠️ Decisão do Gastão (27/08/2026): *"não precisa copiar nada, só pegue os
 * dados do banco e jogue no frontend"*. Nada de sincronizar, nada de tabela
 * espelho: uma fonte só, número sempre atual, nada pra ficar desatualizado.
 *
 * ⚠️ ESTE BANCO É A PRODUÇÃO DO RESTAURANTE. Só SELECT, nunca escrever.
 *
 * Só existe pro agente que tem restaurante (hoje, o Gramado Plazza). Qualquer
 * outro slug devolve null e a tela some com a seção, sem quebrar.
 */

const globalForReservas = globalThis as unknown as {
  sqlReservas?: ReturnType<typeof postgres>;
};

/** Slug do agente que usa este banco. Configurável por env. */
export function slugComReservas(): string {
  return process.env.RESERVAS_AGENT_SLUG || "gramadoplazza";
}

export function temReservas(slug: string): boolean {
  return Boolean(process.env.RESERVAS_DATABASE_URL) && slug === slugComReservas();
}

function conn() {
  if (!globalForReservas.sqlReservas) {
    const url = process.env.RESERVAS_DATABASE_URL;
    if (!url) throw new Error("RESERVAS_DATABASE_URL não configurada");
    globalForReservas.sqlReservas = postgres(url, {
      ssl: "require",
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      // trava de segurança: esta conexão é só de leitura
      connection: { application_name: "painel-agentes-leitura" },
    });
  }
  return globalForReservas.sqlReservas;
}

export type ReservasResumo = {
  /** Reservas FEITAS no período (não canceladas), independente do dia do jantar. */
  feitas: number;
  feitasAnterior: number;
  pessoas: number;
  receita: number;
  canceladas: number;
  compareceram: number;
  naoCompareceram: number;
  pendentes: number;
  /** Reservas feitas por dia, pro gráfico de evolução. */
  porDia: { day: string; reservas: number }[];
  /**
   * ⚠️ VISÃO DA OPERAÇÃO, diferente de tudo acima. `feitas`/`receita` contam
   * a reserva no dia em que ela FOI FEITA (é o que bate com o gasto de
   * anúncio). Isto aqui conta pelo dia do JANTAR e só soma quem confirmou
   * chegada: é o dinheiro que de fato entrou na casa.
   * O Gastão perguntou exatamente por essa diferença ao comparar com o painel
   * do restaurante: lá aparecia R$ 3.214,65 e aqui R$ 4.592,35. Os dois certos,
   * medindo coisas diferentes.
   */
  realizada: { receita: number; mesas: number; pessoas: number };
};

/**
 * ⚠️ CONTA PELA DATA EM QUE A RESERVA FOI FEITA (`created_at`), não pelo dia do
 * jantar. Regra dele, 26/08: *"nas reservas efetuadas conta mesmo que a pessoa
 * tenha reservado para outro dia"*. É o dia em que o anúncio foi pago, então é
 * esse que bate com o investimento.
 *
 * O `created_at` da tabela é `timestamp without time zone` gravado em UTC, por
 * isso a conversão explícita pro fuso do cliente antes de cortar o dia.
 */
export async function getReservas(
  slug: string,
  period: Period,
): Promise<ReservasResumo | null> {
  if (!temReservas(slug)) return null;

  const { from, to, curStart, curEnd, prevStart, prevEnd } = resolveRange(period);
  const sql = conn();

  try {
    const [[atual], [anterior], dias, [real]] = await Promise.all([
      sql<
        {
          feitas: string;
          pessoas: string;
          receita: string;
          canceladas: string;
          compareceram: string;
          nao_compareceram: string;
          pendentes: string;
        }[]
      >`
        select
          count(*) filter (where status::text <> 'cancelou')                 feitas,
          coalesce(sum(adultos + coalesce(criancas_50pct, 0)
                       + coalesce(criancas_isento, 0)
                       + coalesce(criancas_integral, 0))
                   filter (where status::text <> 'cancelou'), 0)            pessoas,
          coalesce(sum(valor_total) filter (where status::text <> 'cancelou'), 0) receita,
          count(*) filter (where status::text = 'cancelou')                 canceladas,
          count(*) filter (where status::text = 'compareceu')               compareceram,
          count(*) filter (where status::text = 'nao_compareceu')           nao_compareceram,
          count(*) filter (where status::text = 'pendente')                 pendentes
        from public.reservas
        where (created_at at time zone 'UTC') >= ${curStart}
          and (created_at at time zone 'UTC') <  ${curEnd}
      `,
      sql<{ feitas: string }[]>`
        select count(*) filter (where status::text <> 'cancelou') feitas
        from public.reservas
        where (created_at at time zone 'UTC') >= ${prevStart}
          and (created_at at time zone 'UTC') <  ${prevEnd}
      `,
      sql<{ day: string; n: string }[]>`
        select to_char(
                 date(created_at at time zone 'UTC' at time zone 'America/Sao_Paulo'),
                 'YYYY-MM-DD') day,
               count(*) n
        from public.reservas
        where (created_at at time zone 'UTC') >= ${curStart}
          and (created_at at time zone 'UTC') <  ${curEnd}
          and status::text <> 'cancelou'
        group by 1
      `,
      // receita REALIZADA: pelo dia do JANTAR, e só quem confirmou chegada
      sql<{ receita: string; mesas: string; pessoas: string }[]>`
        select coalesce(sum(valor_total), 0) receita,
               count(*)                      mesas,
               coalesce(sum(adultos + coalesce(criancas_50pct, 0)
                            + coalesce(criancas_isento, 0)
                            + coalesce(criancas_integral, 0)), 0) pessoas
        from public.reservas
        where data >= ${from} and data <= ${to}
          and status::text = 'compareceu'
      `,
    ]);

    return {
      feitas: Number(atual?.feitas ?? 0),
      feitasAnterior: Number(anterior?.feitas ?? 0),
      pessoas: Number(atual?.pessoas ?? 0),
      receita: Number(atual?.receita ?? 0),
      canceladas: Number(atual?.canceladas ?? 0),
      compareceram: Number(atual?.compareceram ?? 0),
      naoCompareceram: Number(atual?.nao_compareceram ?? 0),
      pendentes: Number(atual?.pendentes ?? 0),
      porDia: dias.map((d) => ({ day: d.day, reservas: Number(d.n) })),
      realizada: {
        receita: Number(real?.receita ?? 0),
        mesas: Number(real?.mesas ?? 0),
        pessoas: Number(real?.pessoas ?? 0),
      },
    };
  } catch {
    // banco do cliente fora do ar não pode derrubar o painel inteiro
    return null;
  }
}
