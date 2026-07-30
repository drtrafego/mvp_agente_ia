import "server-only";
import { sql } from "./db";

/**
 * Log de diagnóstico TEMPORÁRIO no banco (tabela public._diag_access, aditiva).
 * Best-effort: nunca lança, nunca derruba a request. Serve para depurar o 404
 * de sessão dentro do iframe sem depender de log da Vercel. Remover depois.
 */
export async function logDiag(note: string, data: unknown): Promise<void> {
  try {
    await sql`INSERT INTO public._diag_access (note, data)
              VALUES (${note}, ${JSON.stringify(data)}::jsonb)`;
  } catch {
    // diagnóstico nunca interrompe o fluxo real
  }
}
