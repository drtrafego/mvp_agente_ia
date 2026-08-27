import { assertAgentAccess } from "@/lib/access";
import { diagnosticoReservas } from "@/lib/reservas";
import { PageWrapper } from "@/components/page-wrapper";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Página de diagnóstico da conexão com o banco de reservas.
 *
 * ⚠️ Por que existe (27/08/2026): a seção de reservas não aparecia na Visão
 * geral e nós dois ficamos meia hora no escuro. Build ok, deploy ok, variável
 * com o nome certo, zero erro no log, e mesmo assim nada na tela. Em vez de
 * continuar levantando hipótese por mensagem, esta página mostra na TELA o que
 * o servidor está enxergando.
 *
 * ⚠️ NUNCA imprime o valor da credencial: só o nome da variável, o host
 * mascarado e o resultado da leitura.
 *
 * Protegida pelo mesmo gate de acesso do resto do painel.
 */
export default async function DiagReservasPage({
  params,
}: {
  params: Promise<{ org: string; slug: string }>;
}) {
  const { slug } = await params;
  await assertAgentAccess(slug);

  const d = await diagnosticoReservas(slug);

  const linhas: { rotulo: string; valor: string; ok: boolean | null }[] = [
    { rotulo: "Agente (slug da URL)", valor: d.slug, ok: null },
    {
      rotulo: "Está no mapa de reservas?",
      valor: d.noMapa ? "sim" : "NÃO (nenhuma variável esperada pra este slug)",
      ok: d.noMapa,
    },
    {
      rotulo: "Variáveis que o código procura",
      valor: d.nomesEsperados.join(", ") || "(nenhuma)",
      ok: null,
    },
    {
      rotulo: "Variável encontrada no ambiente",
      valor: d.envUsada ?? "NENHUMA das acima existe neste ambiente",
      ok: Boolean(d.envUsada),
    },
    { rotulo: "Host do banco", valor: d.host ?? "—", ok: null },
    {
      rotulo: "Conectou e leu?",
      valor: d.erro ? `NÃO · ${d.erro}` : "sim",
      ok: !d.erro,
    },
    {
      rotulo: "Reservas na tabela",
      valor: d.totalReservas === null ? "—" : String(d.totalReservas),
      ok: d.totalReservas !== null,
    },
  ];

  return (
    <PageWrapper>
      <div className="space-y-4">
        <div>
          <h1 className="text-gradient text-2xl font-bold">
            Diagnóstico · banco de reservas
          </h1>
          <p className="mt-1 text-sm text-muted">
            O que o servidor está enxergando neste exato momento. Nenhuma senha
            aparece aqui.
          </p>
        </div>

        <Card glass className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {linhas.map((l, i) => (
                <tr
                  key={l.rotulo}
                  className={i > 0 ? "border-t border-border" : ""}
                >
                  <td className="w-64 px-4 py-3 align-top text-muted">
                    {l.rotulo}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span
                      className={
                        l.ok === true
                          ? "text-success"
                          : l.ok === false
                            ? "text-destructive"
                            : "text-fg"
                      }
                    >
                      {l.ok === true ? "✓ " : l.ok === false ? "✗ " : ""}
                      {l.valor}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card glass className="p-4">
          <p className="text-xs leading-relaxed text-muted">
            <b className="text-fg">Como ler:</b> se &quot;Variável encontrada&quot;
            estiver vermelha, o nome cadastrado na Vercel não é nenhum dos que o
            código procura, ou não está marcado para o ambiente de Production. Se
            ela estiver verde e &quot;Conectou e leu&quot; estiver vermelha, o
            nome está certo e o problema é a conexão (valor com aspas, quebra de
            linha no fim, ou o banco recusando).
          </p>
        </Card>
      </div>
    </PageWrapper>
  );
}
