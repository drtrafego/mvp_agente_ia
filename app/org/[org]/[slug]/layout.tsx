import { assertOrgAgentAccess, getSessionEmail } from "@/lib/access";
import { isSuperAdmin } from "@/lib/admin";
import { AppShell } from "@/components/sidebar";
import { GlobalPauseBanner } from "@/components/global-pause-banner";
import { getGlobalPause } from "@/lib/actions";

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
  const email = await getSessionEmail();
  // Bot pausado por inteiro é estado perigoso: o aviso acompanha o operador em
  // qualquer tela do agente, não só na de configurações.
  const pause = await getGlobalPause(slug);

  return (
    <AppShell
      basePath={`/org/${org}/${slug}`}
      orgPath={`/org/${org}`}
      name={agent.name}
      persona={agent.persona}
      showSettings={isSuperAdmin(email)}
    >
      {pause.paused ? (
        <GlobalPauseBanner
          agentName={agent.name}
          settingsHref={`/org/${org}/${slug}/configuracoes`}
        />
      ) : null}
      {children}
    </AppShell>
  );
}
