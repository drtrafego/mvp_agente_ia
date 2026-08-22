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
    max: 1,
    idle_timeout: 10, // solta rapido: instancia ociosa nao pode segurar slot
    max_lifetime: 60 * 10,
    connect_timeout: 15,
    prepare: false, // EXIGIDO pelo transaction mode (6543); inofensivo no session mode
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
