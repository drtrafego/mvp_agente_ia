import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(req: NextRequest) {
  const secret = process.env.OPS_DIAG_ORGS_KEY?.trim();
  if (!secret) {
    return NextResponse.json({ error: "OPS_DIAG_ORGS_KEY nao configurada" }, { status: 503 });
  }
  const provided = req.nextUrl.searchParams.get("key");
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: "acesso restrito" }, { status: 401 });
  }

  const orgs = await sql.unsafe<{ id: string; name: string; slug: string }[]>(
    `select id, name, slug from public.organizations order by name`,
  );
  const agents = await sql.unsafe<{ slug: string; name: string; organization_id: string }[]>(
    `select slug, name, organization_id from public.agents order by name`,
  );
  const members = await sql.unsafe<{ organization_id: string; email: string }[]>(
    `select organization_id, email from public.members order by organization_id, email`,
  );

  return NextResponse.json({ ok: true, orgs, agents, members });
}
