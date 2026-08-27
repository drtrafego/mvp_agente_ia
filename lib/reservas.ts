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

/**
 * Qual variável de ambiente guarda o banco de cada cliente.
 *
 * ⚠️ Nome escolhido pelo Gastão (27/08): *"coloca na variável assim
 * RESERVAS_DATABASE_GRAMADO"*. Ele tem razão e é melhor que o genérico: no dia
 * em que um segundo cliente tiver banco de reservas, `RESERVAS_DATABASE_URL`
 * viraria ambiguidade.
 *
 * **Cliente novo com reservas = uma linha aqui.** Nada mais no código.
 * A ordem importa: o primeiro nome que existir no ambiente é o que vale.
 */
const ENV_POR_SLUG: Record<string, string[]> = {
  gramadoplazza: [
    "RESERVAS_DATABASE_GRAMADO",
    "RESERVAS_DATABASE_GRAMADOPLAZZA",
    "RESERVAS_DATABASE_URL", // genérico, mantido por compatibilidade
  ],
};

/** A conexão configurada pra este agente, ou null se não tem banco de reservas. */
function urlDoAgente(slug: string): string | null {
  for (const nome of ENV_POR_SLUG[slug] ?? []) {
    const v = process.env[nome];
    if (v) return v;
  }
  return null;
}

export function temReservas(slug: string): boolean {
  return Boolean(urlDoAgente(slug));
}

/** Agentes que têm banco de reservas configurado neste ambiente. */
export function agentesComReservas(): string[] {
  return Object.keys(ENV_POR_SLUG).filter((s) => temReservas(s));
}

// uma conexão por agente: dois clientes com reserva não podem dividir pool
const pools = new Map<string, ReturnType<typeof postgres>>();

function conn(slug: string) {
  const existente = pools.get(slug);
  if (existente) return existente;
  const url = urlDoAgente(slug);
  if (!url) throw new Error(`sem banco de reservas configurado para ${slug}`);
  const novo = postgres(url, {
      ssl: "require",
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
    // trava de segurança: esta conexão é só de leitura
    connection: { application_name: "painel-agentes-leitura" },
  });
  pools.set(slug, novo);
  return novo;
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
  if (!temReservas(slug)) {
    // agente que ESTÁ no mapa mas não achou variável: quase sempre é nome
    // errado na Vercel, e sem isto a tela só volta ao funil antigo, calada.
    if (ENV_POR_SLUG[slug]) {
      console.error(
        `[reservas] "${slug}" está no mapa mas nenhuma env foi encontrada. ` +
          `Esperava uma destas: ${ENV_POR_SLUG[slug].join(", ")}`,
      );
    }
    return null;
  }

  const { from, to, curStart, curEnd, prevStart, prevEnd } = resolveRange(period);
  const sql = conn(slug);

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
  } catch (e) {
    // ⚠️ O banco do cliente fora do ar NÃO pode derrubar o painel, então
    // engolimos o erro. Mas engolir CALADO já custou meia hora de adivinhação
    // em 27/08: a tela mostrava o funil antigo e não dava pra saber se era
    // variável com nome errado, banco fora, ou query quebrada.
    // Agora o motivo vai pro log da Vercel, onde dá pra ler.
    console.error(
      `[reservas] falhou para "${slug}" (env ${envUsada(slug) ?? "NENHUMA CONFIGURADA"}):`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

/** Qual variável foi encontrada pra este agente. Só pra diagnóstico/log. */
export function envUsada(slug: string): string | null {
  return (ENV_POR_SLUG[slug] ?? []).find((n) => process.env[n]) ?? null;
}

export type DiagReservas = {
  slug: string;
  noMapa: boolean;
  nomesEsperados: string[];
  envUsada: string | null;
  /** Host do banco, sem usuário e sem senha. Só pra confirmar que é o certo. */
  host: string | null;
  /** Nomes (só nomes) de env que lembram reservas/gramado/neon neste ambiente. */
  parecidas: string[];
  totalReservas: number | null;
  erro: string | null;
};

/**
 * Diagnóstico da conexão, pra tela /diag-reservas.
 *
 * ⚠️ NUNCA devolve a credencial. Só o NOME da variável e o HOST, porque foi
 * isso que faltou saber em 27/08: build ok, deploy ok, nome certo, log limpo,
 * e mesmo assim a seção não aparecia. Sem enxergar o que o servidor enxerga,
 * a investigação vira adivinhação por mensagem.
 */
export async function diagnosticoReservas(slug: string): Promise<DiagReservas> {
  const nomesEsperados = ENV_POR_SLUG[slug] ?? [];
  const envUsada = nomesEsperados.find((n) => process.env[n]) ?? null;

  let host: string | null = null;
  if (envUsada) {
    try {
      host = new URL(process.env[envUsada] as string).host;
    } catch {
      host = "(valor não parece uma URL de conexão válida)";
    }
  }

  const base: DiagReservas = {
    slug,
    noMapa: nomesEsperados.length > 0,
    nomesEsperados,
    envUsada,
    host,
    // ⚠️ SÓ OS NOMES, nunca os valores. Serve pra pegar o caso mais chato:
    // a variável existe mas com o nome ligeiramente diferente (typo, hífen no
    // lugar de underline, RESERVA sem S). Sem isto, "não achei" e "achei com
    // outro nome" são indistinguíveis, e foi exatamente onde travamos.
    parecidas: Object.keys(process.env)
      .filter((k) => /RESERV|GRAMADO|NEON/i.test(k))
      .sort(),
    totalReservas: null,
    erro: envUsada ? null : "nenhuma variável de ambiente encontrada",
  };
  if (!envUsada) return base;

  try {
    const [row] = await conn(slug)<{ n: string }[]>`
      select count(*) n from public.reservas
    `;
    return { ...base, totalReservas: Number(row?.n ?? 0) };
  } catch (e) {
    return { ...base, erro: e instanceof Error ? e.message : String(e) };
  }
}
