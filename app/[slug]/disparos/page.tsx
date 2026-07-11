import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { getMetaConfig, getLeadSource } from "@/lib/meta-config";
import {
  listScheduledDispatches,
  getAutoRecovery,
  listCampaigns,
  getFollowupConfig,
} from "@/lib/actions";
import { PageHeader } from "@/components/page-header";
import { PageWrapper } from "@/components/page-wrapper";
import { DisparosManager } from "@/components/disparos-manager";
import { FollowupCard } from "@/components/followup-card";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DisparosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) notFound();

  const sendEnabled = !!getMetaConfig(slug);
  const autoSupported = getLeadSource(slug).leadSource === "form";

  const [dispatches, autoRecovery, campaigns, followup] = await Promise.all([
    listScheduledDispatches(slug),
    getAutoRecovery(slug),
    listCampaigns(slug),
    getFollowupConfig(slug),
  ]);

  const pendentes = dispatches.filter(
    (d) => d.kind === "selected" && d.status === "pending",
  ).length;

  return (
    <PageWrapper>
      <PageHeader
        title="Disparos"
        subtitle={
          pendentes
            ? `${formatNumber(pendentes)} disparo${pendentes > 1 ? "s" : ""} na fila/agendado${pendentes > 1 ? "s" : ""}`
            : "Programe e acompanhe os disparos de template"
        }
      />

      {!sendEnabled ? (
        <p className="mb-4 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-2">
          Este agente não tem número de WhatsApp oficial: disparos indisponíveis.
        </p>
      ) : null}

      <div className="space-y-5">
        <FollowupCard
          slug={slug}
          config={followup}
          supported={sendEnabled}
        />
        <DisparosManager
          slug={slug}
          dispatches={dispatches}
          autoRecovery={autoRecovery}
          campaigns={campaigns}
          autoSupported={autoSupported && sendEnabled}
        />
      </div>
    </PageWrapper>
  );
}
