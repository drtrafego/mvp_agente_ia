// Config de backend da WhatsApp Cloud API por agente.
// phoneNumberId e wabaId ficam no código; só o token é env (META_ACCESS_TOKEN).
export const META_GRAPH_VERSION =
  process.env.META_GRAPH_VERSION?.trim() || "v21.0";

export type MetaAgentConfig = { phoneNumberId: string; wabaId: string };

const CONFIG: Record<string, MetaAgentConfig> = {
  agente24horas: {
    phoneNumberId: "115216611574100",
    wabaId: "106071169159774",
  },
  casaldotrafego: {
    phoneNumberId: "414594695067374",
    wabaId: "404364559427067",
  },
  // drlucas: sem número oficial — envio desabilitado.
};

export function getMetaConfig(slug: string): MetaAgentConfig | null {
  return CONFIG[slug] ?? null;
}
