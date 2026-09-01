import { NextResponse } from "next/server";
import { assertAgentAccess } from "@/lib/access";
import { montarListaConversas } from "@/lib/conversas-lista";
import type { ConvChannel, ConvFilter } from "@/lib/queries";

export const dynamic = "force-dynamic";

// A resposta carrega conversa de cliente e o app é enquadrado por um portal de
// terceiro: nada disto pode encostar em cache compartilhado.
const SEM_CACHE = { "Cache-Control": "private, no-store" };

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

  try {
    const items = await montarListaConversas(slug, ch, filter);
    return NextResponse.json({ items }, { headers: SEM_CACHE });
  } catch (e) {
    // ‼️ 5xx, e NUNCA 200 com a lista pela metade. Quando a consulta do bot
    // estourava, as três funções devolviam [], esta rota respondia 200 e o
    // atendente via a lista esvaziar com o carimbo "atualizado às HH:MM" em
    // cima. Com o erro na cara, a tela cai no recuo progressivo: guarda o dado
    // anterior e avisa que não conseguiu falar com o servidor.
    console.error(
      `[conversas] lista falhou (agente ${slug}, canal ${ch}, filtro ${filter}):`,
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json(
      { error: "não foi possível carregar as conversas" },
      { status: 503, headers: SEM_CACHE },
    );
  }
}
