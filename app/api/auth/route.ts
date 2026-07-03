import { NextResponse, type NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const from = String(form.get("from") ?? "/");
  const expected = process.env.DASHBOARD_PASSWORD;

  const base = req.nextUrl.origin;

  if (!expected || password !== expected) {
    return NextResponse.redirect(`${base}/login?error=1`, { status: 303 });
  }

  const res = NextResponse.redirect(`${base}${from.startsWith("/") ? from : "/"}`, {
    status: 303,
  });
  res.cookies.set("dash_auth", expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
