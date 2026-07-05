import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { getMetaConfig } from "@/lib/meta-config";
import { getApprovedTemplates, listCampaigns } from "@/lib/actions";
import { PageHeader } from "@/components/page-header";
import { PageWrapper } from "@/components/page-wrapper";
import { CampaignsManager } from "@/components/campaigns-manager";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) notFound();

  const sendEnabled = !!getMetaConfig(slug);
  const [campaigns, templates] = await Promise.all([
    listCampaigns(slug),
    sendEnabled ? getApprovedTemplates(slug) : Promise.resolve([]),
  ]);

  return (
    <PageWrapper>
      <PageHeader
        title="Campanhas"
        subtitle={
          campaigns.length
            ? `${formatNumber(campaigns.length)} campanha${
                campaigns.length > 1 ? "s" : ""
              } salva${campaigns.length > 1 ? "s" : ""}`
            : "Modelos de disparo prontos para reuso"
        }
      />
      <CampaignsManager
        slug={slug}
        campaigns={campaigns}
        templates={templates}
        sendEnabled={sendEnabled}
      />
    </PageWrapper>
  );
}
