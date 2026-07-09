import { NextRequest } from "next/server";
import { runDispatches } from "@/lib/dispatch-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const secret = process.env.DISPATCH_CRON_SECRET;
  const provided =
    req.nextUrl.searchParams.get("secret") ??
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  if (!secret || provided !== secret) {
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
