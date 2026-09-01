import {
  getBotConversations,
  getOutreachConvos,
  getDispatchConvos,
  type ConvChannel,
  type ConvFilter,
  type ConvOrigin,
} from "@/lib/queries";
import type { BoardItem } from "@/components/conversas-board";

/**
 * Monta a lista da tela de Conversas (bot + prospecção + disparo, já ordenada).
 *
 * Mora aqui, e não dentro da página, porque DUAS entradas precisam do mesmo
 * resultado: a página (primeira carga) e /api/conversas/lista (a atualização
 * automática). Se cada uma montasse a sua, a lista mudaria de forma sozinha a
 * cada ciclo de refresh.
 */
export async function montarListaConversas(
  slug: string,
  ch: ConvChannel,
  filter: ConvFilter,
): Promise<BoardItem[]> {
  const [botConvos, outreachConvos, dispatchConvos] = await Promise.all([
    getBotConversations(slug, ch, filter),
    getOutreachConvos(slug, ch, filter),
    getDispatchConvos(slug, ch, filter),
  ]);

  return [
    ...botConvos.map((cv) => ({
      key: `bot:${cv.session_id}`,
      kind: "bot" as const,
      id: cv.session_id,
      title: cv.title ?? "Conversa sem título",
      handle: cv.chat_id,
      origin: cv.origin,
      originDetail: cv.originDetail,
      // ordena pela ULTIMA mensagem, nao pela primeira (24/08): uma conversa
      // antiga que acabou de receber mensagem tem que subir pro topo, igual
      // WhatsApp. Antes, uma conversa iniciada dia 16 ficava enterrada mesmo
      // com resposta de agora, e o dono nao via o que estava acontecendo.
      date: cv.ended_at ?? cv.started_at,
      count: cv.message_count,
    })),
    ...outreachConvos.map((oc) => ({
      key: `outreach:${oc.id}`,
      kind: "outreach" as const,
      id: oc.id,
      title: oc.lead_name ?? oc.lead_handle ?? "Lead",
      handle: oc.lead_handle,
      origin: "Prospecção" as ConvOrigin,
      originDetail: "Lead que nós mineramos e abordamos",
      date: oc.last_at,
      count: oc.msg_count,
    })),
    ...dispatchConvos.map((dc) => ({
      key: `dispatch:${dc.phone_norm}`,
      kind: "dispatch" as const,
      id: dc.phone_norm,
      title: dc.full_name ?? dc.phone_norm,
      handle: dc.phone_norm,
      origin: "Disparo" as ConvOrigin,
      originDetail: "Disparo nosso pelo WhatsApp",
      date: dc.sent_at,
      count: 1,
    })),
  ].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });
}
