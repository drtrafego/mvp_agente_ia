export type Agent = {
  slug: string;
  schema: string;
  name: string;
  persona: string;
  description: string;
  accent: "primary" | "secondary" | "accent";
};

export const AGENTS: Agent[] = [
  {
    slug: "agente24horas",
    schema: "agente24horas",
    name: "Agente24Horas",
    persona: "Nina",
    description: "Atendimento 24h no WhatsApp",
    accent: "secondary",
  },
  {
    slug: "casaldotrafego",
    schema: "casaldotrafego",
    name: "Casal do Tráfego",
    persona: "Amanda",
    description: "SAC e qualificação de leads de tráfego pago",
    accent: "accent",
  },
  {
    slug: "drlucas",
    schema: "drlucas",
    name: "Dr. Lucas",
    persona: "Assistente",
    description: "Atendimento clínico e agendamentos",
    accent: "primary",
  },
];

const BY_SLUG = new Map(AGENTS.map((a) => [a.slug, a]));

export function getAgent(slug: string): Agent | undefined {
  return BY_SLUG.get(slug);
}

/** Allowlist de schemas: só schemas conhecidos podem ir para uma query. */
export function safeSchema(slug: string): string {
  const agent = BY_SLUG.get(slug);
  if (!agent) throw new Error(`Agente desconhecido: ${slug}`);
  return agent.schema;
}
