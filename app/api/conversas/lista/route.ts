import { NextResponse } from "next/server";
import { assertAgentAccess } from "@/lib/access";
import { montarListaConversas } from "@/lib/conversas-lista";
import type { ConvChannel, ConvFilter } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Só a LISTA de conversas, sem o painel e sem re-renderizar a página inteira.
 * É o que a atualização automática do board chama de tempos em tempos.
 *
 * Existe separada de /api/conversas/panel de propósito: quem está com uma
 * conversa aberta paga lista + painel, quem está só na lista paga só a lista.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "parâmetros ausentes" }, { status: 400 });
  }

  // Mesmo gate de acesso das telas: negativa cai em notFound (404).
  await assertAgentAccess(slug);

  const ch: ConvChannel =
    searchParams.get("ch") === "email" ? "email" : "whatsapp";
  const f = searchParams.get("f");
  const filter: ConvFilter =
    f === "ativas24h" || f === "responderam" ? f : "all";

  const items = await montarListaConversas(slug, ch, filter);
  return NextResponse.json({ items });
}
