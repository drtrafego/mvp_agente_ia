import "server-only";
import { sql } from "./db";
import { assertIdent } from "./identifier";
import { addDays, resolveRange, type Period } from "./periodo";
import type { Agent } from "./agents";
import type { ReservasResumo } from "./reservas";

/**
 * O FUNIL DO BOT. É isto que a "Visão geral" mostra, e nada além disto.
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE (27/08/2026). A tela era uma fileira de cards
 * montada sobre public.meta_leads (19 linhas na vida inteira, 2 nos últimos 30
 * dias) e public.ctwa_referrals (2 linhas na história). Fonte morta: os quatro
 * bots apareciam zerados e a tela parecia quebrada. O dado vivo está em
 * <schema>.conversations, <schema>.crm_leads, public.outreach_convos e no banco
 * de reservas do restaurante.
 *
 * Quatro etapas, a mesma forma pra todo bot, cada uma lida da fonte que AQUELE
 * bot realmente tem:
 *
 *   1. Chegou    conversa iniciada (ou disparo entregue, na prospecção)
 *   2. Respondeu mandou pelo menos uma mensagem
 *   3. Avançou   coluna de atendimento do CRM, ou 4+ mensagens quando o CRM
 *                não usa essa coluna
 *   4. Fechou    reserva criada, coluna de fechamento do CRM, ou status
 *                agendado na prospecção
 *   5. Extra     compareceu (só onde isso é medido)
 *
 * ⚠️ A REGRA MAIS IMPORTANTE: **zero medido aparece, zero por falta de fonte
 * some.** Se o bot mede a etapa e ela deu zero no período, o zero é informação
 * e vai pra tela. Se o bot NÃO tem a fonte (o Agente24Horas não tem
 * fechamento, o CRM dele está vazio), a etapa **não existe** naquela tela e
 * vira uma linha discreta no rodapé. Zero no lugar de dado inexistente lê como
 * performance ruim, e foi exatamente isso que fez a tela parecer quebrada nos
 * quatro bots.
 *
 * ⚠️ Contagem por TELEFONE distinto, nunca por sessão: o Gramado tem 102 leads
 * em 100 telefones, e contar sessão infla o topo e afunda a taxa.
 */

export type EtapaKey = "chegou" | "respondeu" | "avancou" | "fechou" | "extra";

export type FunilEtapa = {
  key: EtapaKey;
  /** Rótulo do cliente, no plural: "Reservaram", "Consulta Agendada". */
  label: string;
  /** Verbo no infinitivo, pra frase "perde X% entre chegar e responder". */
  verbo: string;
  /** De onde o número saiu, em português de gente. */
  fonte: string;
  value: number;
  /** Mesmo número no período anterior. null = não dá pra comparar. */
  previous: number | null;
  /** Um dado a mais na mesma linha (receita, por exemplo). */
  hint: string | null;
};

export type Funil = {
  /** "pessoas" no bot de atendimento, "disparos" na prospecção. */
  unidade: string;
  etapas: FunilEtapa[];
  /** Frases pro rodapé, uma por etapa que este bot não mede. */
  ausentes: string[];
  /** Existe período anterior com movimento? Sem isso, variação não aparece. */
  comparavel: boolean;
  /** Base do período >= 30. Abaixo disso, variação é ruído e não se destaca. */
  destacarVariacao: boolean;
  porDia: { day: string; chegou: number; fechou: number }[];
  /** Rótulos das duas linhas do gráfico. fechou = null quando não é medido. */
  serie: { chegou: string; fechou: string | null };
};

// ---- classificação das colunas do CRM -------------------------------
// Cada cliente batiza as colunas do jeito dele ("Consulta Agendada",
// "Reserva Confirmada", "Fechado"), então a etapa sai do NOME, não da posição:
// no template de vendas a posição 2 é "Qualificado" (avançou) e a 3 é
// "Fechado"; no de atendimento a posição 2 já é o fechamento.

type ClasseColuna = "novo" | "avancou" | "fechou" | "extra" | "perdido";

function classificarColuna(title: string): ClasseColuna {
  const t = (title ?? "").toLowerCase();
  if (/perd|cancel|descart|desist/.test(t)) return "perdido";
  if (/comparec|presen[çc]/.test(t)) return "extra";
  if (
    /fechad|ganho|agendad|agenda|confirmad|reserva|consulta|vend|convertid|matricul|contrat|cliente/.test(
      t,
    )
  )
    return "fechou";
  if (/atendimento|qualificad|convers|negocia|proposta|or[çc]amento|follow/.test(t))
    return "avancou";
  return "novo";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Predicado SQL "o lead está numa destas colunas". Só aceita UUID de verdade. */
function emColunas(ids: string[]): string {
  const limpos = ids.filter((id) => UUID_RE.test(id));
  if (!limpos.length) return "false";
  return `l.column_id in (${limpos.map((id) => `'${id}'`).join(", ")})`;
}

// ---- utilidades ------------------------------------------------------

const DIGITOS = (col: string) => `regexp_replace(coalesce(${col}, ''), '\\D', '', 'g')`;
/** Chave da pessoa: telefone só com dígitos, com a sessão como último recurso. */
const CHAVE = `coalesce(nullif(${DIGITOS("c.chat_id")}, ''), c.session_id)`;
const DIA = (col: string) =>
  `to_char(${col} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;

type SqlParam = string | number | null;

async function rows<T>(query: string, params: SqlParam[] = []): Promise<T[]> {
  try {
    return await sql.unsafe<T[]>(query, params);
  } catch (e) {
    console.error("[funil] consulta falhou:", e instanceof Error ? e.message : e);
    return [];
  }
}

function diasDoPeriodo(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from;
  for (let i = 0; i < 400 && d <= to; i++) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/**
 * ⚠️ O TOTAL DO PERÍODO NÃO É A SOMA DOS DIAS. Quem voltou a falar na quinta
 * depois de ter falado na terça aparece nos dois dias, e somar contaria a
 * mesma pessoa duas vezes (o Dr. Lucas tem 33 conversas em 30 telefones). Por
 * isso toda consulta usa `grouping sets ((dia), ())`: a linha com dia NULO é o
 * total do período inteiro, com o distinct feito de uma vez só.
 */
function separar<T extends { dia: string | null }>(
  linhas: T[],
): { total: T | null; dias: T[] } {
  return {
    total: linhas.find((r) => r.dia == null) ?? null,
    dias: linhas.filter((r) => r.dia != null),
  };
}

function tot<T extends { dia: string | null }>(
  x: { total: T | null },
  campo: keyof T,
): number {
  return Number(x.total?.[campo] ?? 0);
}

const POR_DIA_E_TOTAL = "group by grouping sets ((dia), ())";

// ---- linhas cruas de cada fonte --------------------------------------

type LinhaConversa = {
  dia: string | null;
  chegou: number;
  respondeu: number;
  engajou: number;
};
type LinhaCrm = {
  dia: string | null;
  avancou: number;
  fechou: number;
  extra: number;
};
type LinhaOutreach = {
  dia: string | null;
  chegou: number;
  respondeu: number;
  avancou: number;
  fechou: number;
};

/**
 * Conversas do bot no período, por dia e por telefone distinto.
 * "respondeu" = a conversa tem pelo menos uma mensagem com role='user'.
 * A agregação de mensagens é feita UMA vez e cruzada por join: não existe
 * índice em messages(session_id), então um exists() por conversa varreria a
 * tabela inteira 446 vezes na tela do Agente24Horas.
 */
async function conversas(schema: string, a: string, b: string) {
  return separar(
    await rows<LinhaConversa>(
      `select dia,
              count(distinct chave)::int chegou,
              count(distinct chave) filter (where tem_user)::int respondeu,
              count(distinct chave) filter (where msgs >= 4)::int engajou
       from (
         select ${CHAVE} chave,
                ${DIA("c.started_at")} dia,
                coalesce(mu.tem_user, false) tem_user,
                coalesce(c.message_count, 0) msgs
         from "${schema}".conversations c
         left join (
           select session_id, true tem_user
           from "${schema}".messages where role = 'user' group by session_id
         ) mu on mu.session_id = c.session_id
         where c.started_at >= $1 and c.started_at < $2
       ) t
       ${POR_DIA_E_TOTAL}`,
      [a, b],
    ),
  );
}

/**
 * As etapas que moram no CRM do próprio agente, contadas sobre a MESMA coorte
 * do topo: as pessoas que chegaram no período. É o que faz o funil descer em
 * vez de misturar universos (quem está em "Consulta Agendada" já passou por
 * "Atendimento", então a contagem é acumulada da etapa pra frente).
 *
 * O casamento é por telefone: exato, ou pelos últimos 8 dígitos, que cobre
 * variação de DDI e do nono dígito.
 */
async function crm(
  schema: string,
  cols: { avancou: string[]; fechou: string[]; extra: string[] },
  a: string,
  b: string,
) {
  return separar(
    await rows<LinhaCrm>(
      `with conv as (
       select ${CHAVE} chave,
              min(${DIA("c.started_at")}) dia,
              min(nullif(${DIGITOS("c.chat_id")}, '')) fone
       from "${schema}".conversations c
       where c.started_at >= $1 and c.started_at < $2
       group by 1
     ),
     lead as (
       select nullif(${DIGITOS("l.phone")}, '') fone,
              case
                when ${emColunas(cols.extra)} then 3
                when ${emColunas(cols.fechou)} then 2
                when ${emColunas(cols.avancou)} then 1
                else 0
              end nivel
       from "${schema}".crm_leads l
       where l.column_id is not null
     ),
     coorte as (
       select conv.dia, conv.chave, coalesce(max(lead.nivel), 0) nivel
       from conv
       left join lead
         on lead.fone is not null and conv.fone is not null
        and length(lead.fone) >= 8 and length(conv.fone) >= 8
        and right(lead.fone, 8) = right(conv.fone, 8)
       group by conv.dia, conv.chave
     )
       select dia,
              count(*) filter (where nivel >= 1)::int avancou,
              count(*) filter (where nivel >= 2)::int fechou,
              count(*) filter (where nivel >= 3)::int extra
       from coorte
       ${POR_DIA_E_TOTAL}`,
      [a, b],
    ),
  );
}

/** Prospecção: cada convo de public.outreach_convos é um disparo entregue. */
async function outreach(slug: string, a: string, b: string) {
  const pessoa = `coalesce(nullif(oc.lead_handle, ''), oc.id)`;
  return separar(
    await rows<LinhaOutreach>(
      `select dia,
              count(distinct pessoa)::int chegou,
              count(distinct pessoa) filter (where respondeu)::int respondeu,
              count(distinct pessoa) filter (where inb >= 2)::int avancou,
              count(distinct pessoa) filter (where fechou)::int fechou
       from (
         select ${pessoa} pessoa,
                ${DIA("oc.last_at")} dia,
                oc.status in ('replied', 'booked') respondeu,
                oc.status = 'booked' fechou,
                (select count(*) from public.outreach_msgs m
                 where m.convo_id = oc.id and m.direction = 'inbound') inb
         from public.outreach_convos oc
         where oc.agent_slug = $1 and oc.last_at >= $2 and oc.last_at < $3
       ) t
       ${POR_DIA_E_TOTAL}`,
      [slug, a, b],
    ),
  );
}

// ---- montagem do funil -----------------------------------------------

type ColunaCrm = { id: string; title: string; classe: ClasseColuna; usada: boolean };

async function lerColunasCrm(schema: string): Promise<ColunaCrm[] | null> {
  const cols = await rows<{ id: string; title: string; leads: number }>(
    `select c.id, c.title, count(l.id)::int leads
     from "${schema}".crm_columns c
     left join "${schema}".crm_leads l on l.column_id = c.id
     group by c.id, c.title, c."order" order by c."order"`,
  );
  if (!cols.length) return null;
  // CRM sem nenhum lead na vida = CRM que o cliente não usa. Não é fonte.
  if (cols.every((c) => c.leads === 0)) return null;
  return cols.map((c) => ({
    id: c.id,
    title: c.title,
    classe: classificarColuna(c.title),
    usada: c.leads > 0,
  }));
}

export async function getFunil(
  agent: Agent,
  period: Period,
  reservas: ReservasResumo | null,
): Promise<Funil> {
  const schema = assertIdent(agent.schema);
  const { from, to, curStart, curEnd, prevStart, prevEnd } = resolveRange(period);
  const dias = diasDoPeriodo(from, to);

  const etapas: FunilEtapa[] = [];
  const ausentes: string[] = [];
  const porDia = new Map<string, { chegou: number; fechou: number }>(
    dias.map((d) => [d, { chegou: 0, fechou: 0 }]),
  );
  const acumula = (dia: string | null, campo: "chegou" | "fechou", v: number) => {
    const linha = dia ? porDia.get(dia) : undefined;
    if (linha) linha[campo] += v;
  };

  // ---------- prospecção (Casal do Tráfego) ----------
  if (agent.leadSource === "outreach") {
    const [cur, prev] = await Promise.all([
      outreach(agent.slug, curStart, curEnd),
      outreach(agent.slug, prevStart, prevEnd),
    ]);
    for (const r of cur.dias) {
      acumula(r.dia, "chegou", r.chegou);
      acumula(r.dia, "fechou", r.fechou);
    }
    const prevChegou = tot(prev, "chegou");
    etapas.push(
      etapa("chegou", "Disparos entregues", "chegar", "mensagem enviada ao lead", tot(cur, "chegou"), prevChegou),
      etapa("respondeu", "Responderam", "responder", "o lead respondeu o disparo", tot(cur, "respondeu"), tot(prev, "respondeu")),
      etapa("avancou", "Conversaram", "conversar", "duas ou mais respostas do lead", tot(cur, "avancou"), tot(prev, "avancou")),
      etapa("fechou", "Agendaram", "agendar", "conversa marcada como agendada", tot(cur, "fechou"), tot(prev, "fechou")),
    );
    return montar({
      unidade: "disparos",
      etapas,
      ausentes,
      prevChegou,
      porDia,
      dias,
      serie: { chegou: "Disparos", fechou: "Agendaram" },
    });
  }

  // ---------- bot de atendimento (Gramado, Dr. Lucas, Agente24Horas) ----------
  const [cur, prev, colunas] = await Promise.all([
    conversas(schema, curStart, curEnd),
    conversas(schema, prevStart, prevEnd),
    lerColunasCrm(schema),
  ]);
  for (const r of cur.dias) acumula(r.dia, "chegou", r.chegou);

  const prevChegou = tot(prev, "chegou");
  etapas.push(
    etapa("chegou", "Conversas iniciadas", "chegar", "primeira conversa com o bot", tot(cur, "chegou"), prevChegou),
    etapa("respondeu", "Responderam", "responder", "mandaram pelo menos uma mensagem", tot(cur, "respondeu"), tot(prev, "respondeu")),
  );

  const colFechou = colunas?.filter((c) => c.classe === "fechou") ?? [];
  const colExtra = colunas?.filter((c) => c.classe === "extra") ?? [];
  const colAvancou = colunas?.filter((c) => c.classe === "avancou") ?? [];
  // A coluna de atendimento só vale como fonte quando o cliente REALMENTE a
  // usa. O Gramado tem a coluna "Atendimento" e nunca pôs ninguém nela: lá o
  // avanço honesto é a conversa que passou de 4 mensagens.
  const avancoNoCrm = colAvancou.some((c) => c.usada);
  // Com banco de reservas, fechamento e comparecimento saem de lá e o CRM não
  // é consultado à toa.
  const precisaCrm = avancoNoCrm || (!reservas && colFechou.length > 0);

  const ids = {
    avancou: colAvancou.map((c) => c.id),
    fechou: colFechou.map((c) => c.id),
    extra: colExtra.map((c) => c.id),
  };
  const vazio = { total: null as LinhaCrm | null, dias: [] as LinhaCrm[] };
  const [crmCur, crmPrev] = precisaCrm
    ? await Promise.all([
        crm(schema, ids, curStart, curEnd),
        crm(schema, ids, prevStart, prevEnd),
      ])
    : [vazio, vazio];

  if (avancoNoCrm) {
    const nome = colAvancou.find((c) => c.usada)?.title ?? "atendimento";
    etapas.push(
      etapa("avancou", "Avançaram", "avançar", `coluna "${nome}" do CRM em diante`, tot(crmCur, "avancou"), tot(crmPrev, "avancou")),
    );
  } else {
    etapas.push(
      etapa("avancou", "Avançaram", "avançar", "conversa com 4 mensagens ou mais", tot(cur, "engajou"), tot(prev, "engajou")),
    );
  }

  // Fechamento: a reserva do restaurante ganha do CRM, porque vem do sistema
  // onde a reserva de fato acontece.
  if (reservas) {
    etapas.push({
      key: "fechou",
      label: "Reservaram",
      verbo: "reservar",
      fonte: "reserva criada no sistema do restaurante",
      value: reservas.feitas,
      previous: reservas.feitasAnterior,
      hint: reservas.receita > 0 ? `${formatarReais(reservas.receita)} reservados` : null,
    });
    for (const r of reservas.porDia) acumula(r.day, "fechou", r.reservas);
    etapas.push({
      key: "extra",
      label: "Compareceram",
      verbo: "comparecer",
      fonte: "reserva com chegada confirmada",
      value: reservas.compareceram,
      previous: null,
      hint:
        reservas.realizada.receita > 0
          ? `${formatarReais(reservas.realizada.receita)} na casa`
          : null,
    });
  } else if (colFechou.length) {
    const nome = colFechou[0].title;
    etapas.push(
      etapa("fechou", nome, "fechar", `coluna "${nome}" do CRM em diante`, tot(crmCur, "fechou"), tot(crmPrev, "fechou")),
    );
    for (const r of crmCur.dias) acumula(r.dia, "fechou", r.fechou);
    if (colExtra.length) {
      const extraNome = colExtra[0].title;
      etapas.push(
        etapa("extra", extraNome, "comparecer", `coluna "${extraNome}" do CRM`, tot(crmCur, "extra"), tot(crmPrev, "extra")),
      );
    }
  } else {
    ausentes.push("Fechamento ainda não é medido neste bot.");
  }

  const temFechou = etapas.some((e) => e.key === "fechou");
  return montar({
    unidade: "pessoas",
    etapas,
    ausentes,
    prevChegou,
    porDia,
    dias,
    serie: {
      chegou: "Chegaram",
      fechou: temFechou ? etapas.find((e) => e.key === "fechou")!.label : null,
    },
  });
}

function etapa(
  key: EtapaKey,
  label: string,
  verbo: string,
  fonte: string,
  value: number,
  previous: number | null,
): FunilEtapa {
  return { key, label, verbo, fonte, value, previous, hint: null };
}

function formatarReais(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
}

function montar(x: {
  unidade: string;
  etapas: FunilEtapa[];
  ausentes: string[];
  prevChegou: number;
  porDia: Map<string, { chegou: number; fechou: number }>;
  dias: string[];
  serie: { chegou: string; fechou: string | null };
}): Funil {
  const base = x.etapas[0]?.value ?? 0;
  return {
    unidade: x.unidade,
    etapas: x.etapas,
    ausentes: x.ausentes,
    // ⚠️ Sem período anterior NÃO existe variação: o Gramado subiu em 26/08 e
    // qualquer divisão por zero viraria "+infinito" na cara do cliente.
    comparavel: x.prevChegou > 0,
    // ⚠️ Com 28 pessoas na semana, 10% é ruído. A variação continua na tela,
    // só perde o destaque (deixa de ser verde/vermelha).
    destacarVariacao: base >= 30,
    porDia: x.dias.map((day) => ({
      day,
      chegou: x.porDia.get(day)?.chegou ?? 0,
      fechou: x.porDia.get(day)?.fechou ?? 0,
    })),
    serie: x.serie,
  };
}

/**
 * A maior queda entre duas etapas seguidas. Uma frase dizendo ONDE o bot perde
 * mais vale mais que seis cards, e é a única leitura que vira ação.
 * Ignora degrau com base pequena, senão "perde 100%" de 2 pra 0 rouba a cena.
 */
export function maiorPerda(
  f: Funil,
): { de: string; para: string; pct: number } | null {
  let pior: { de: string; para: string; pct: number } | null = null;
  for (let i = 1; i < f.etapas.length; i++) {
    const ant = f.etapas[i - 1];
    const at = f.etapas[i];
    if (ant.value < 10) continue;
    const pct = ((ant.value - at.value) / ant.value) * 100;
    if (pct <= 0) continue;
    if (!pior || pct > pior.pct) pior = { de: ant.verbo, para: at.verbo, pct };
  }
  return pior;
}

/**
 * A taxa que abre a tela: fim a fim, do topo até o fechamento. Sem etapa de
 * fechamento (bot que não mede isso), vai até a última etapa medida e o
 * `completo: false` avisa a tela a não chamar aquilo de fim a fim.
 */
export function taxaFimAFim(
  f: Funil,
): { pct: number; completo: boolean; topo: FunilEtapa; fim: FunilEtapa } | null {
  const topo = f.etapas[0];
  const fechou = f.etapas.find((e) => e.key === "fechou");
  const fim = fechou ?? [...f.etapas].reverse().find((e) => e.key !== "chegou");
  if (!topo || !fim || topo === fim) return null;
  return {
    pct: topo.value > 0 ? (fim.value / topo.value) * 100 : 0,
    completo: Boolean(fechou),
    topo,
    fim,
  };
}
