import { getMetaConfig } from "@/lib/meta-config";
import { getAgendaConfig, getAgendaBloqueios } from "@/lib/actions";
import { assertAgentAccess } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { PageWrapper } from "@/components/page-wrapper";
import { HorariosCard } from "@/components/horarios-card";
import { BloqueiosDatas } from "@/components/bloqueios-datas";

export const dynamic = "force-dynamic";

// Bloqueio de data pontual é específico do agente do Dr. Lucas (só o container
// dele tem o agenda_tools.py). Não expor a seção pros outros clientes.
const SLUGS_COM_BLOQUEIO = new Set(["drlucas"]);

export default async function HorariosPage({
  params,
}: {
  params: Promise<{ org: string; slug: string }>;
}) {
  const { slug } = await params;
  // Gate de acesso antes de qualquer leitura, igual às demais telas.
  const agent = await assertAgentAccess(slug);

  // Mesma porta dos outros recursos do painel (follow-up/disparos).
  const supported = !!getMetaConfig(agent);
  const comBloqueio = supported && SLUGS_COM_BLOQUEIO.has(slug);
  const [config, bloqueios] = await Promise.all([
    getAgendaConfig(slug),
    comBloqueio ? getAgendaBloqueios(slug) : Promise.resolve([]),
  ]);

  return (
    <PageWrapper>
      <PageHeader
        title="Horários"
        subtitle="Configure os horários que o bot pode agendar e o webhook do CRM"
      />
      <HorariosCard slug={slug} config={config} supported={supported} />
      {comBloqueio ? (
        <div className="mt-5">
          <BloqueiosDatas slug={slug} bloqueios={bloqueios} />
        </div>
      ) : null}
    </PageWrapper>
  );
}
