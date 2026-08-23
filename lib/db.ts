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
    // transaction mode MULTIPLEXA no servidor, entao um max maior aqui NAO estoura o
    // teto do banco; ajuda a nao enfileirar as queries da pagina (menos lentidao).
    max: 10,
    idle_timeout: 20, // solta conexao ociosa
    max_lifetime: 60 * 30, // recicla conexao a cada 30 min (menos re-handshake)
    // 30s, nao 10. Medido em producao: conectar leva de 3s a 12s enquanto o
    // pooler esta sob pressao. Com 10 o painel desistia ANTES do banco
    // responder, e a tela dizia "sem acesso a nenhuma empresa" (o acesso faz
    // falha fechada quando a consulta nao volta). Preferimos esperar a mais
    // do que devolver tela vazia para o cliente.
    connect_timeout: 30,
    prepare: false, // EXIGIDO pelo transaction mode (6543); inofensivo no session mode
  });
}

export const sql = globalForDb.sql ?? create();
// reaproveita o MESMO cliente sempre (inclusive em producao) pra instancias quentes
// nao criarem conexoes novas a cada carga do modulo.
globalForDb.sql = sql;
