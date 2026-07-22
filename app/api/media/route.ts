import { NextRequest } from "next/server";
import { canAccessAgent } from "@/lib/access";

const BASE_URL =
  process.env.HERMES_PANEL_URL ?? "https://hermes.casaldotrafego.com/agente";

const FILE_RE = /^[A-Za-z0-9._-]+$/;

export async function GET(req: NextRequest) {
  const agente = req.nextUrl.searchParams.get("agente") ?? "";
  const file = req.nextUrl.searchParams.get("file") ?? "";

  if (!FILE_RE.test(file)) {
    return new Response("Requisição inválida.", { status: 400 });
  }

  // Autorização por agente, não só existência do slug: sem acesso, 404 seco,
  // sem revelar se o agente existe. Vale também para mídia de outra empresa.
  if (!(await canAccessAgent(agente))) {
    return new Response("Não encontrado.", { status: 404 });
  }

  const token = process.env.PAINEL_API_TOKEN;
  if (!token) {
    return new Response("Servidor sem token configurado.", { status: 500 });
  }

  const url = `${BASE_URL}/api/media?agente=${encodeURIComponent(
    agente,
  )}&file=${encodeURIComponent(file)}`;

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return new Response("Mídia não encontrada.", { status: 404 });
    }

    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    });
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);

    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return new Response("Falha ao obter a mídia.", { status: 502 });
  }
}
