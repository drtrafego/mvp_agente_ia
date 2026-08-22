import postgres from "postgres";

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

// Usa o pooler do Supabase em TRANSACTION mode (porta 6543) quando a DATABASE_URL
// aponta pro pooler em session mode (5432). Em transaction mode, muitas conexoes do
// painel DIVIDEM poucas conexoes reais do banco -> nao estoura o teto (60 conexoes) e
// o painel nao "some" mais. Feito aqui no CODIGO pra NAO depender de mexer na Vercel.
// So reescreve se for host de pooler (nao toca em conexao direta db.<ref>.supabase.co).
function toTransactionPooler(url: string): string {
  if (url.includes("pooler.supabase.com") && url.includes(":5432")) {
    return url.replace(":5432", ":6543");
  }
  return url;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  return postgres(toTransactionPooler(url), {
    ssl: "require",
    // 1, e nao 10. Em serverless cada INSTANCIA tem o seu proprio pool: com
    // max 10 e uma dezena de instancias quentes, sao 100 conexoes disputando
    // o pooler, que tem teto bem menor. O resultado foi ECHECKOUTTIMEOUT em
    // producao e a tela dizendo "nenhum agente". Quem multiplexa e o pooler
    // do Supabase, do lado do servidor; abrir mais conexoes aqui nao acelera
    // nada, so consome o teto compartilhado mais rapido.
    // 3, o valor que rodava antes de subir para 10 e estourar o pooler.
    // Com 1 o catalogo carrega, mas as telas que disparam varias consultas
    // em paralelo (a visao geral) ficam presas na fila de uma conexao so.
    // 3 da paralelismo suficiente sem multiplicar demais por instancia.
    max: 3,
    // O pooler derruba conexao ociosa sozinho. Se a nossa expirar DEPOIS da
    // dele, o cliente tenta escrever num socket ja morto e da
    // CONNECTION_CLOSED. Entao soltamos antes: 5s aqui, e vida curta.
    idle_timeout: 5,
    max_lifetime: 60 * 5,
    connect_timeout: 15,
    prepare: false, // EXIGIDO pelo transaction mode (6543); inofensivo no session mode
    // Sem isto a lib roda uma introspecao de tipos ao abrir CADA conexao.
    // Em transaction mode isso e round-trip extra em toda query e uma fonte
    // conhecida de falha com PgBouncer.
    fetch_types: false,
    // Aparece em pg_stat_activity: permite ver do lado do banco quem esta
    // consumindo conexao, o painel ou os syncs do servidor.
    connection: { application_name: "agente-ia" },
    // Sem isto, um erro de conexao vira unhandled rejection e DERRUBA o
    // processo inteiro (exit 128), levando junto requests que nada tinham a
    // ver. Melhor a consulta falhar e a tela tratar do que a função morrer.
    onnotice: () => {},
  });
}

export const sql = globalForDb.sql ?? create();

// Pool cheio ou rede caindo viram rejeição não tratada e MATAM o processo
// (exit 128 nos logs de produção), levando junto requests que nada tinham a
// ver. O ouvinte registra e mantém a função de pé; quem chamou a consulta
// trata o erro normalmente. Registrado uma vez só: em instância quente o
// módulo recarrega e registrar de novo vazaria listener.
const g = globalThis as unknown as { __dbGuard?: boolean };
if (!g.__dbGuard) {
  g.__dbGuard = true;
  process.on("unhandledRejection", (motivo) => {
    console.error("[db] rejeição não tratada, processo mantido de pé:", motivo);
  });
}
// reaproveita o MESMO cliente sempre (inclusive em producao) pra instancias quentes
// nao criarem conexoes novas a cada carga do modulo.
globalForDb.sql = sql;
