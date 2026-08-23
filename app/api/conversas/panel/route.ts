import { NextResponse } from "next/server";
import {
  getConversation,
  getMessages,
  getMessagesByContact,
  getLeadForConversation,
  getOutreachConvo,
  getOutreachMessages,
  getDispatchConvo,
} from "@/lib/queries";
import { getPausedChatIds, getApprovedTemplates } from "@/lib/actions";
import { assertAgentAccess } from "@/lib/access";
import { getMetaConfig } from "@/lib/meta-config";

export const dynamic = "force-dynamic";

/**
 * Carrega SÓ o painel de uma conversa (mensagens + contexto), sem re-renderizar
 * a lista inteira. É o que dá fluidez ao trocar de conversa: o board client
 * chama esta rota, guarda em cache e reabre instantâneo.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const kind = searchParams.get("kind");
  const id = searchParams.get("id");

  if (!slug || !kind || !id) {
    return NextResponse.json({ error: "parâmetros ausentes" }, { status: 400 });
  }

  // Mesmo gate de acesso das telas: negativa cai em notFound (404).
  const agent = await assertAgentAccess(slug);

  if (kind === "bot") {
    const conversation = await getConversation(slug, id);
    if (!conversation) {
      return NextResponse.json({ error: "não encontrada" }, { status: 404 });
    }
    const sendEnabled = !!getMetaConfig(agent);
    const [messages, paused, lead, templates] = await Promise.all([
      // Todas as sessões DESTE CONTATO, não só a sessão aberta: o bot
      // encerra a sessão e um lembrete dias depois nasce como outra, o que
      // partia a história do lead em dois cards. Sem chat_id (e-mail) não
      // há como agrupar, então cai na sessão única.
      conversation.chat_id
        ? getMessagesByContact(slug, conversation.chat_id)
        : getMessages(slug, conversation.session_id),
      conversation.chat_id ? getPausedChatIds(slug) : Promise.resolve<string[]>([]),
      getLeadForConversation(conversation),
      sendEnabled ? getApprovedTemplates(slug) : Promise.resolve([]),
    ]);
    const isPaused = conversation.chat_id
      ? paused.includes(conversation.chat_id)
      : false;
    return NextResponse.json({
      kind: "bot",
      conversation,
      messages,
      isPaused,
      sendEnabled,
      templates,
      lead,
    });
  }

  if (kind === "outreach") {
    const convo = await getOutreachConvo(slug, id);
    if (!convo) {
      return NextResponse.json({ error: "não encontrada" }, { status: 404 });
    }
    const messages = await getOutreachMessages(convo.id);
    return NextResponse.json({ kind: "outreach", convo, messages });
  }

  if (kind === "dispatch") {
    const detail = await getDispatchConvo(slug, id);
    if (!detail) {
      return NextResponse.json({ error: "não encontrada" }, { status: 404 });
    }
    return NextResponse.json({ kind: "dispatch", detail });
  }

  return NextResponse.json({ error: "kind inválido" }, { status: 400 });
}
