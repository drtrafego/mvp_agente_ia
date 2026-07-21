import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { getMetaConfig } from "@/lib/meta-config";
import { getAgendaConfig } from "@/lib/actions";
import { PageHeader } from "@/components/page-header";
import { PageWrapper } from "@/components/page-wrapper";
import { HorariosCard } from "@/components/horarios-card";

export const dynamic = "force-dynamic";

export default async function HorariosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) notFound();

  // Mesma porta dos outros recursos do painel (follow-up/disparos).
  const supported = !!getMetaConfig(slug);
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
