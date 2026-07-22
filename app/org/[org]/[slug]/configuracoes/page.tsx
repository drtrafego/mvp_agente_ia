import { assertAgentAccess, getSessionEmail } from "@/lib/access";
import { isSuperAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/page-header";
import { PageWrapper } from "@/components/page-wrapper";
import { AgentSettingsForm } from "@/components/agent-settings-form";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage({
  params,
}: {
  params: Promise<{ org: string; slug: string }>;
}) {
  const { slug } = await params;
  const agent = await assertAgentAccess(slug);
  const email = await getSessionEmail();
  const canEdit = isSuperAdmin(email);

  return (
    <PageWrapper>
      <PageHeader
        title="Configurações"
        subtitle="Identificação, número da Meta e fonte de leads deste agente"
      />
      <AgentSettingsForm
        canEdit={canEdit}
        initial={{
          slug: agent.slug,
          schema: agent.schema,
          orgName: agent.orgName,
          // O token cifrado NUNCA vai para a tela: só o fato de existir.
          hasToken: !!agent.metaTokenCipher,
          tokenEnv: agent.metaTokenEnv,
          name: agent.name,
          persona: agent.persona,
          description: agent.description,
          accent: agent.accent,
          metaPhoneNumberId: agent.metaPhoneNumberId ?? "",
          metaWabaId: agent.metaWabaId ?? "",
          leadSource: agent.leadSource,
          leadSourcePageId: agent.leadSourcePageId ?? "",
          metaToken: "",
        }}
      />
    </PageWrapper>
  );
}
