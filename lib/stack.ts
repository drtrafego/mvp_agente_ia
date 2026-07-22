import { StackServerApp } from "@stackframe/stack";

/**
 * Stack Auth do lado servidor, no MESMO projeto do portal
 * (cliente.casaldotrafego.com). As envs NEXT_PUBLIC_STACK_PROJECT_ID e
 * STACK_SECRET_SERVER_KEY precisam ser idênticas às do portal, senão a
 * sessão que chega do iframe não é reconhecida.
 *
 * Degrada sem quebrar: sem as envs (ou com erro de construção), o export vale
 * null e quem chama cai no fluxo antigo de senha (DASHBOARD_PASSWORD). O app
 * continua no ar, só sem SSO.
 */
const projectId = process.env.NEXT_PUBLIC_STACK_PROJECT_ID?.trim();
const secretServerKey = process.env.STACK_SECRET_SERVER_KEY?.trim();

export const stackAuthConfigured = Boolean(projectId && secretServerKey);

function createStackServerApp() {
  if (!projectId || !secretServerKey) {
    console.warn(
      "Stack Auth não configurado (NEXT_PUBLIC_STACK_PROJECT_ID ou STACK_SECRET_SERVER_KEY ausente).",
    );
    return null;
  }
  try {
    return new StackServerApp({
      tokenStore: "nextjs-cookie",
      projectId,
      secretServerKey,
    });
  } catch (err) {
    console.error("Falha ao inicializar o Stack Auth:", err);
    return null;
  }
}

export const stackServerApp = createStackServerApp();
