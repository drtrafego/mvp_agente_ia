import { StackServerApp } from "@stackframe/stack";

/**
 * Stack Auth do lado servidor, no MESMO projeto do portal
 * (cliente.casaldotrafego.com). As envs NEXT_PUBLIC_STACK_PROJECT_ID e
 * STACK_SECRET_SERVER_KEY precisam ser idênticas às do portal, senão a
 * sessão que chega do iframe não é reconhecida.
 *
 * Sem as envs (ou com erro de construção) o export vale null. Nesse caso não
 * há login possível, e o middleware tranca o app em vez de abrir: sem
 * identidade não dá para decidir quem enxerga qual empresa.
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
