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
    max: 3, // menos conexoes por instancia serverless (com transaction mode, ja sobra)
    idle_timeout: 10, // solta conexao ociosa rapido
    max_lifetime: 60 * 5, // recicla conexao a cada 5 min
    connect_timeout: 15,
    prepare: false, // EXIGIDO pelo transaction mode (6543); inofensivo no session mode
  });
}

export const sql = globalForDb.sql ?? create();
// reaproveita o MESMO cliente sempre (inclusive em producao) pra instancias quentes
// nao criarem conexoes novas a cada carga do modulo.
globalForDb.sql = sql;
