import Link from "next/link";
import { MessageCircle, Mail } from "lucide-react";
import {
  getConversation,
  getMessages,
  getLeadForConversation,
  getOutreachConvo,
  getOutreachMessages,
  getDispatchConvo,
  type ConvChannel,
  type ConvFilter,
} from "@/lib/queries";
import { montarListaConversas } from "@/lib/conversas-lista";
import {
  ConversasBoard,
  type PanelPayload,
} from "@/components/conversas-board";
import { StatusAtualizacao } from "@/components/status-atualizacao";
import { getPausedChatIds, getApprovedTemplates } from "@/lib/actions";
import { assertAgentAccess, getSessionEmail } from "@/lib/access";
import { isSuperAdmin } from "@/lib/admin";
import { getMetaConfig } from "@/lib/meta-config";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; slug: string }>;
  searchParams: Promise<{
    c?: string;
    o?: string;
    d?: string;
    ch?: string;
    f?: string;
  }>;
}) {
  const { org, slug } = await params;
  const { c, o, d, ch: chParam, f: fParam } = await searchParams;
  // Gate de acesso antes de qualquer consulta desta tela.
  const agent = await assertAgentAccess(slug);
  // Custo de IA por conversa: só o dono (super admin) vê.
  const canSeeCost = isSuperAdmin(await getSessionEmail());
  const basePath = `/org/${org}/${slug}`;
  const ch: ConvChannel = chParam === "email" ? "email" : "whatsapp";
  const filter: ConvFilter =
    fParam === "ativas24h" || fParam === "responderam" ? fParam : "all";

  // A MESMA montagem que /api/conversas/lista usa na atualização automática.
  const items = await montarListaConversas(slug, ch, filter);

  const sendEnabled = !!getMetaConfig(agent);

  // Seleção inicial (deep-link, refresh ou "Atualizar agora"): monta o payload
  // do painel no servidor. A troca de conversa em si é feita client-side pelo
  // board, sem re-renderizar a lista.
  let initialKey: string | null = null;
  let initialPayload: PanelPayload | null = null;

  if (c) {
    const conversation = await getConversation(slug, c);
    if (conversation) {
      const [messages, paused, lead, templates] = await Promise.all([
        getMessages(slug, conversation.session_id),
        conversation.chat_id ? getPausedChatIds(slug) : Promise.resolve<string[]>([]),
        getLeadForConversation(conversation),
        sendEnabled ? getApprovedTemplates(slug) : Promise.resolve([]),
      ]);
      const isPaused = conversation.chat_id
        ? paused.includes(conversation.chat_id)
        : false;
      initialKey = `bot:${conversation.session_id}`;
      initialPayload = {
        kind: "bot",
        conversation,
        messages,
        isPaused,
        sendEnabled,
        templates,
        lead,
      };
    }
  } else if (o) {
    const convo = await getOutreachConvo(slug, o);
    if (convo) {
      const messages = await getOutreachMessages(convo.id);
      initialKey = `outreach:${convo.id}`;
      initialPayload = { kind: "outreach", convo, messages };
    }
  } else if (d) {
    const detail = await getDispatchConvo(slug, d);
    if (detail) {
      initialKey = `dispatch:${detail.phone_norm}`;
      initialPayload = { kind: "dispatch", detail };
    }
  }

  return (
    <div className="animate-fade-in flex min-h-[calc(100dvh-3.5rem-var(--pausebar,0px))] flex-col p-3 sm:p-4 lg:min-h-[calc(100dvh-var(--pausebar,0px))]">
      <ConversasBoard
        slug={slug}
        basePath={basePath}
        ch={ch}
        filter={filter}
        items={items}
        initialKey={initialKey}
        initialPayload={initialPayload}
        canSeeCost={canSeeCost}
        header={
          <div className="flex flex-col gap-3">
            <div className="flex shrink-0 items-baseline justify-between gap-3 px-1">
              <h1 className="text-gradient text-lg font-semibold tracking-tight sm:text-xl">
                Conversas
              </h1>
              {/* O contador vem do CLIENTE: ele muda sozinho junto com a
                  lista. Aqui no servidor ele congelaria na primeira carga. */}
              <StatusAtualizacao />
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <ChannelTabs basePath={basePath} ch={ch} filter={filter} />
              <FilterChips basePath={basePath} ch={ch} filter={filter} />
            </div>
          </div>
        }
      />
    </div>
  );
}

function ChannelTabs({
  basePath,
  ch,
  filter,
}: {
  basePath: string;
  ch: ConvChannel;
  filter: ConvFilter;
}) {
  const fq = filter !== "all" ? `&f=${filter}` : "";
  const tabs: { key: ConvChannel; label: string; icon: React.ReactNode }[] = [
    { key: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="size-4" /> },
    { key: "email", label: "E-mail", icon: <Mail className="size-4" /> },
  ];
  return (
    <div className="flex w-full shrink-0 gap-1 rounded-xl border border-border bg-surface-2/60 p-1 sm:w-auto">
      {tabs.map((t) => {
        const active = t.key === ch;
        return (
          <Link
            key={t.key}
            href={`${basePath}/conversas?ch=${t.key}${fq}`}
            scroll={false}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none",
              active
                ? "brand-gradient text-white"
                : "text-muted hover:text-fg",
            )}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

function FilterChips({
  basePath,
  ch,
  filter,
}: {
  basePath: string;
  ch: ConvChannel;
  filter: ConvFilter;
}) {
  const chips: { key: ConvFilter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "ativas24h", label: "Ativas 24h" },
    { key: "responderam", label: "Responderam" },
  ];
  return (
    <div className="flex w-full shrink-0 gap-1 overflow-x-auto sm:w-auto">
      {chips.map((chip) => {
        const active = chip.key === filter;
        const fq = chip.key !== "all" ? `&f=${chip.key}` : "";
        return (
          <Link
            key={chip.key}
            href={`${basePath}/conversas?ch=${ch}${fq}`}
            scroll={false}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-transparent brand-gradient text-white"
                : "border-border bg-surface-2/60 text-muted hover:text-fg",
            )}
          >
            {chip.label}
          </Link>
        );
      })}
    </div>
  );
}
