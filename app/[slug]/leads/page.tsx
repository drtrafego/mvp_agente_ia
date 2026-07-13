import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { getAgent } from "@/lib/agents";
import { getFormLeads } from "@/lib/queries";
import { getApprovedTemplates, listCampaigns } from "@/lib/actions";
import { getMetaConfig } from "@/lib/meta-config";
import { PageHeader } from "@/components/page-header";
import { PageWrapper } from "@/components/page-wrapper";
import { LeadList } from "@/components/lead-list";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) notFound();

  const leads = await getFormLeads(slug);
  const converted = leads.filter((l) => l.conversou).length;
  const sendEnabled = !!getMetaConfig(slug);
  const [templates, campaigns] = await Promise.all([
    sendEnabled ? getApprovedTemplates(slug) : Promise.resolve([]),
    listCampaigns(slug),
  ]);

  return (
    <PageWrapper>
      <PageHeader
        title="Leads"
        subtitle={
          leads.length
            ? `${formatNumber(leads.length)} leads (formulário + anúncio) · ${formatNumber(
                converted,
              )} já conversaram`
            : "Leads capturados por formulário e anúncio (Click-to-WhatsApp)"
        }
      />

      {leads.length === 0 ? (
        <EmptyLeads />
      ) : (
        <LeadList
          slug={slug}
          leads={leads}
          templates={templates}
          campaigns={campaigns}
          sendEnabled={sendEnabled}
        />
      )}
    </PageWrapper>
  );
}

function EmptyLeads() {
  return (
    <div className="animate-fade-up grid place-items-center rounded-2xl border border-dashed border-border glass p-14 text-center shadow-soft">
      <div>
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-accent-2/15 text-[#c4b5fd]">
          <UserPlus className="size-6" />
        </span>
        <p className="font-medium">Nenhum lead ainda</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          Assim que os formulários Meta capturarem contatos, eles aparecem aqui
          com o status de atendimento.
        </p>
      </div>
    </div>
  );
}
