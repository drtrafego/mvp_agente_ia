import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { stackServerApp, stackAuthConfigured } from "@/lib/stack";
import { getUserOrgs } from "@/lib/access";
import { isSuperAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico temporário de sessão. Read-only, só devolve o que o SERVIDOR
 * (contexto serverless, o mesmo das páginas) enxerga da sessão de QUEM chama.
 * Não recebe nem ecoa dado de terceiro: só a própria sessão do requisitante.
 * Remover depois de resolver o 404 da Patricia.
 */
export async function GET(_req: NextRequest) {
  const jar = await cookies();
  const stackCookies = jar
    .getAll()
    .map((c) => c.name)
    .filter(
      (n) =>
        n === "stack-access" ||
        n.startsWith("stack-refresh-") ||
        n.startsWith("__Host-stack-refresh-"),
    );

  let email: string | null = null;
  let getUserError: string | null = null;
  if (stackServerApp) {
    try {
      const user = await stackServerApp.getUser();
      email = user?.primaryEmail?.trim().toLowerCase() ?? null;
    } catch (err) {
      getUserError = String(err instanceof Error ? err.message : err);
    }
  }

  let orgs: { slug: string; name: string }[] = [];
  if (email) {
    try {
      orgs = (await getUserOrgs(email)).map((o) => ({ slug: o.slug, name: o.name }));
    } catch (err) {
      getUserError = getUserError ?? String(err);
    }
  }

  return NextResponse.json({
    stackAuthConfigured,
    stackCookiesPresent: stackCookies,
    resolvedEmail: email,
    isSuperAdmin: isSuperAdmin(email),
    orgs,
    getUserError,
  });
}
