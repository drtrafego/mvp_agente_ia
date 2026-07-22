import { notFound, permanentRedirect, redirect } from "next/navigation";
import { queryFromSearchParams, resolveLegacyTarget } from "@/lib/legacy-routes";

export const dynamic = "force-dynamic";

/**
 * Sub rotas antigas /[slug]/conversas, /[slug]/leads e companhia. Preserva o
 * caminho e a querystring no redirect 308. Sai na Fase 7.
 */
export default async function LegacyAgentSubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; rest: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, rest } = await params;
  const query = queryFromSearchParams(await searchParams);

  const target = await resolveLegacyTarget(slug, rest ?? [], query);
  if (target.kind === "notFound") notFound();
  if (target.kind === "list") redirect("/");
  permanentRedirect(target.path);
}
