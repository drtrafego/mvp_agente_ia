import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Building2, ShieldAlert, Sparkles } from "lucide-react";
import { getSessionEmail, getUserOrgs } from "@/lib/access";
import { PortalLink } from "@/components/portal-link";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const email = await getSessionEmail();
  if (!email) redirect("/handler/sign-in");

  const orgs = await getUserOrgs(email);

  // Uma empresa só: entra direto, sem tela intermediária.
  if (orgs.length === 1) redirect(`/org/${orgs[0].slug}`);

  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
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
          Suas empresas
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Selecione a empresa para ver os agentes de atendimento dela.
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
        <section className="grid gap-4 sm:grid-cols-2">
          {orgs.map((org, i) => (
            <Link
              key={org.id}
              href={`/org/${org.slug}`}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group relative animate-fade-up overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-soft ring-1 ring-inset ring-secondary/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-xl bg-secondary/20 text-secondary">
                    <Building2 className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold leading-tight">{org.name}</h2>
                    <p className="truncate text-xs text-muted">{org.slug}</p>
                  </div>
                </div>
                <ArrowUpRight className="size-5 text-muted-2 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
