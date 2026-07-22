import { assertOrgAgentAccess } from "@/lib/access";
import { AppShell } from "@/components/sidebar";

export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string; slug: string }>;
}) {
  const { org, slug } = await params;

  // Gate completo (seção 4.4 do plano), roda antes das páginas filhas:
  // sessão Stack, empresa da URL, membership ou superadmin, agente ativo e
  // agente pertencente àquela empresa. Qualquer falha vira 404, nunca 403.
  const { agent } = await assertOrgAgentAccess(org, slug);

  return (
    <AppShell
      basePath={`/org/${org}/${slug}`}
      orgPath={`/org/${org}`}
      name={agent.name}
      persona={agent.persona}
    >
      {children}
    </AppShell>
  );
}
