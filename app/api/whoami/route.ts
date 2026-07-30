import { NextResponse, type NextRequest } from "next/server";
import { cookies, headers } from "next/headers";
import { stackServerApp, stackAuthConfigured } from "@/lib/stack";
import { getUserOrgs } from "@/lib/access";
import { isSuperAdmin } from "@/lib/admin";
import { logDiag } from "@/lib/diag";

const DIAG_VERSION = "diag-3";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico temporário de sessão. Read-only, só devolve o que o SERVIDOR
 * (contexto serverless, o mesmo das páginas) enxerga da sessão de QUEM chama.
 * Não recebe nem ecoa dado de terceiro: só a própria sessão do requisitante.
 * Remover depois de resolver o 404 da Patricia.
 */
export async function GET(req: NextRequest) {
  // ?probe=1 grava uma linha na tabela de diagnóstico. Serve para EU confirmar,
  // com a minha própria requisição, que a gravação funciona em produção.
  let wroteProbe = false;
  if (req.nextUrl.searchParams.has("probe")) {
    await logDiag("probe", { version: DIAG_VERSION, ua: req.headers.get("user-agent") });
    wroteProbe = true;
  }

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
  // Corte anti bot: sem cookie de sessão, NÃO chama o Stack (protege a cota de
  // usuários ativos, igual ao middleware).
  if (stackServerApp && stackCookies.length > 0) {
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

  // Header que o middleware repassa (ou apaga, se veio forjado de fora).
  const identityHeader = (await headers()).get("x-stack-user-email");

  return NextResponse.json({
    version: DIAG_VERSION,
    wroteProbe,
    stackAuthConfigured,
    stackCookiesPresent: stackCookies,
    identityHeader,
    resolvedEmail: email,
    isSuperAdmin: isSuperAdmin(email),
    orgs,
    getUserError,
  });
}
