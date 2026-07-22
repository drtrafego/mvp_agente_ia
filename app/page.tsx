import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Bot, Building2, ShieldAlert, Sparkles } from "lucide-react";
import { getOrgAgents, getSessionEmail, getUserOrgs } from "@/lib/access";
import { PortalLink } from "@/components/portal-link";
import type { Agent } from "@/lib/agents";

export const dynamic = "force-dynamic";

const ACCENT: Record<string, string> = {
  primary: "bg-primary/20 text-secondary",
  secondary: "bg-secondary/20 text-secondary",
  accent: "bg-accent/20 text-accent",
};

export default async function PortalPage() {
  const email = await getSessionEmail();
  if (!email) redirect("/handler/sign-in");

  const orgs = await getUserOrgs(email);

  // Cliente de uma empresa só não passa por tela de escolha. Com um agente
  // único, vai direto para o painel dele; com vários, para a lista da empresa.
  if (orgs.length === 1) {
    const agents = await getOrgAgents(orgs[0].id);
    if (agents.length === 1) {
      redirect(`/org/${orgs[0].slug}/${agents[0].slug}`);
    }
    redirect(`/org/${orgs[0].slug}`);
  }

  // Mais de uma empresa (o caso do superadmin): mostra TODOS os agentes,
  // agrupados por empresa, para escolher agente e cliente de uma vez só.
  const grupos = await Promise.all(
    orgs.map(async (org) => ({
      org,
      agents: await getOrgAgents(org.id),
    })),
  );
  const totalAgentes = grupos.reduce((n, g) => n + g.agents.length, 0);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="mb-6">
        <PortalLink className="-ml-3" />
      </div>

      <header className="mb-10 animate-fade-up">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl brand-gradient text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]">
            <Sparkles className="size-5" />
          </div>
          <span className="text-sm font-medium text-muted">Central de Agentes IA</span>
        </div>
        <h1 className="text-gradient inline-block text-3xl font-semibold tracking-tight sm:text-4xl">
          Todos os agentes
        </h1>
        <p className="mt-2 max-w-lg text-sm text-muted">
          {totalAgentes} {totalAgentes === 1 ? "agente" : "agentes"} em{" "}
          {orgs.length} empresas. Escolha o agente que quer acompanhar.
        </p>
      </header>

      {orgs.length === 0 ? (
        <div className="animate-fade-up grid place-items-center rounded-2xl border border-dashed border-border glass p-14 text-center shadow-soft">
          <div>
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-accent-2/15 text-[#c4b5fd]">
              <ShieldAlert className="size-6" />
            </span>
            <p className="font-medium">Sem acesso a nenhuma empresa</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Sua conta está autenticada, mas ainda não está vinculada a nenhuma
              empresa. Fale com o suporte pelo portal do cliente.
            </p>
            <a
              href="https://cliente.casaldotrafego.com/hub"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-fg"
            >
              Abrir o portal <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-9">
          {grupos.map(({ org, agents }, gi) => (
            <section
              key={org.id}
              style={{ animationDelay: `${gi * 60}ms` }}
              className="animate-fade-up"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-8 place-items-center rounded-lg bg-secondary/15 text-secondary">
                    <Building2 className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold leading-tight">
                      {org.name}
                    </h2>
                    <p className="truncate text-[11px] text-muted-2">{org.slug}</p>
                  </div>
                </div>
                <Link
                  href={`/org/${org.slug}`}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-2 transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  Ver a empresa
                </Link>
              </div>

              {agents.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-2">
                  Nenhum agente ativo nesta empresa.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {agents.map((agent: Agent) => (
                    <Link
                      key={agent.id}
                      href={`/org/${org.slug}/${agent.slug}`}
                      className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                              ACCENT[agent.accent] ?? ACCENT.primary
                            }`}
                          >
                            <Bot className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold leading-tight">
                              {agent.name}
                            </h3>
                            <p className="truncate text-xs text-muted">
                              {agent.persona ? `Persona ${agent.persona}` : agent.slug}
                            </p>
                          </div>
                        </div>
                        <ArrowUpRight className="size-4 shrink-0 text-muted-2 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
                      </div>
                      {agent.description ? (
                        <p className="mt-3 line-clamp-2 text-xs text-muted-2">
                          {agent.description}
                        </p>
                      ) : null}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
