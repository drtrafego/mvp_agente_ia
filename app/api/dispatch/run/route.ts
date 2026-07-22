import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { runDispatches } from "@/lib/dispatch-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Comparação de segredo em tempo constante. Compara os digests SHA 256, que
 * têm sempre 32 bytes: assim segredos de tamanhos diferentes não caem em um
 * retorno antecipado que vazaria o comprimento pelo tempo de resposta.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  const secret = process.env.DISPATCH_CRON_SECRET;
  const provided =
    req.nextUrl.searchParams.get("secret") ??
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  // Fail closed: sem segredo configurado no servidor, ninguém dispara.
  if (!secret || !provided || !secretMatches(provided, secret)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const res = await runDispatches();
    return Response.json(res);
  } catch {
    return Response.json(
      { ok: false, error: "run failed" },
      { status: 200 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
