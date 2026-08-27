// Tipos, defaults e helpers do follow-up.
//
// ⚠️ Isto NÃO pode morar em `lib/actions.ts`: aquele arquivo é "use server" e
// só aceita exportar funções async. Constante e type guard quebram o build
// com "Server Actions must be async functions".

/**
 * Um passo pode ser "X minutos depois da última fala do bot" (o que sempre
 * existiu) ou "no dia seguinte, às H horas". O segundo formato foi pedido pelo
 * Gastão em 26/08 para o Gramado Plazza e não cabia no antigo, porque não é um
 * intervalo fixo: depende da hora em que a conversa aconteceu.
 */
export type FollowupStep =
  | { delayMinutes: number }
  | { nextDayAtHour: number };

/**
 * Faixa de horário em que o follow-up pode sair. Fora dela nada é enviado, e o
 * que venceu NÃO se acumula para disparar junto depois.
 */
export type FollowupWindow = { startHour: number; endHour: number };

/**
 * Intervalo entre um envio e o próximo, sorteado dentro da faixa. Cadência
 * fixa (sempre 2 min, sempre 45s) é a assinatura mais óbvia de robô e o
 * WhatsApp pune: em 26/08 um bot mandou 12 mensagens em 9 segundos.
 */
export type FollowupSpacing = { minSeconds: number; maxSeconds: number };

export type FollowupConfig = {
  enabled: boolean;
  steps: FollowupStep[];
  window?: FollowupWindow;
  spacing?: FollowupSpacing;
  /**
   * Régua própria para quem chegou clicando num anúncio. Esse lead levantou a
   * mão e tem janela de 72h com a Meta (free entry point), contra 24h de quem
   * veio da prospecção, então aceita uma sequência mais longa.
   */
  stepsByOrigin?: { ad?: FollowupStep[] };
};

export const FOLLOWUP_DEFAULT_WINDOW: FollowupWindow = {
  startHour: 8,
  endHour: 20,
};

export const FOLLOWUP_DEFAULT_SPACING: FollowupSpacing = {
  minSeconds: 50,
  maxSeconds: 170,
};

export function isDelayStep(s: FollowupStep): s is { delayMinutes: number } {
  return typeof (s as { delayMinutes?: unknown }).delayMinutes === "number";
}
