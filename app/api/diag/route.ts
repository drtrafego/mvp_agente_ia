import { sql } from "@/lib/db";
import { listAgents } from "@/lib/agents";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico temporário do catálogo. Existe porque o painel, quando não
 * consegue carregar public.agents, devolve lista vazia DE PROPÓSITO, e a tela
 * diz "nenhum agente" sem nenhum erro visível. Isso torna impossível saber de
 * fora se o problema é banco, conexão ou permissão.
 *
 * NÃO expõe credencial: da URL do banco só saem host e porta, nunca usuário
 * nem senha. Remover assim que o problema estiver resolvido.
 */
export async function GET() {
  const bruto = process.env.DATABASE_URL ?? "";
  let host = "(DATABASE_URL ausente)";
  let porta = "";
  try {
    if (bruto) {
      const u = new URL(bruto);
      host = u.hostname;
      porta = u.port || "(padrão)";
    }
  } catch {
    host = "(DATABASE_URL não é uma URL válida)";
  }

  const saida: Record<string, unknown> = {
    db_host: host,
    db_porta_configurada: porta,
    // o db.ts reescreve 5432 -> 6543 quando é pooler; isso diz o que valeu
    usa_transaction_pooler: host.includes("pooler.supabase.com"),
    quando: new Date().toISOString(),
  };

  // 1) o banco responde?
  const t0 = Date.now();
  try {
    const r = await sql.unsafe<{ n: number }[]>(
      "select count(*)::int as n from public.agents where active = true",
    );
    saida.conexao = "ok";
    saida.ms_da_consulta = Date.now() - t0;
    saida.agentes_ativos_no_banco = r[0]?.n ?? 0;
  } catch (e) {
    saida.conexao = "FALHOU";
    saida.ms_da_consulta = Date.now() - t0;
    saida.erro_do_banco = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
  }

  // 2) a coluna panel_url existe neste banco?
  try {
    const c = await sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from information_schema.columns
        where table_schema='public' and table_name='agents' and column_name='panel_url'`,
    );
    saida.tem_coluna_panel_url = (c[0]?.n ?? 0) > 0;
  } catch {
    saida.tem_coluna_panel_url = "não deu para checar";
  }

  // 3) o catálogo em memória, que é o que a tela realmente usa
  try {
    const agentes = await listAgents();
    saida.catalogo_carregado = agentes.length;
    saida.slugs = agentes.map((a) => a.slug);
  } catch (e) {
    saida.catalogo_carregado = "FALHOU";
    saida.erro_do_catalogo =
      e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
  }

  return Response.json(saida, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
