import { getMetaConfig } from "@/lib/meta-config";
import { getAgendaConfig } from "@/lib/actions";
import { assertAgentAccess } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { PageWrapper } from "@/components/page-wrapper";
import { HorariosCard } from "@/components/horarios-card";

export const dynamic = "force-dynamic";

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
  const config = await getAgendaConfig(slug);

  return (
    <PageWrapper>
      <PageHeader
        title="Horários"
        subtitle="Configure os horários que o bot pode agendar e o webhook do CRM"
      />
      <HorariosCard slug={slug} config={config} supported={supported} />
    </PageWrapper>
  );
}
