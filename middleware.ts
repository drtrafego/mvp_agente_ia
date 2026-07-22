import { NextResponse, type NextRequest } from "next/server";
import { stackServerApp } from "@/lib/stack";

// Origens do portal que podem enquadrar este app em iframe (as duas existem,
// cliente e clientes). frame-ancestors é o único cabeçalho dos dois que aceita
// origem específica. NÃO adicionar X-Frame-Options: SAMEORIGIN, quebraria o
// iframe do portal.
const CSP_FRAME_ANCESTORS =
  "frame-ancestors 'self' https://cliente.casaldotrafego.com https://clientes.casaldotrafego.com";

/**
 * Rotas que passam sem gate de sessão.
 *
 * /handler, /login e /api/auth são as telas de login.
 * /api/dispatch é o cron de disparos: ele roda sem usuário, valida o próprio
 * segredo (DISPATCH_CRON_SECRET) dentro da rota e responde 401 sem ele. Sem
 * esta exceção, o gate de senha redirecionaria o cron para /login e os
 * disparos parariam de sair.
 */
function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/handler") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/dispatch")
  );
}

function allow(): NextResponse {
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", CSP_FRAME_ANCESTORS);
  return res;
}

/**
 * Receptor do token injetado pelo portal na URL do iframe (?__st=), cópia do
 * mvp_crm/src/middleware.ts. O Chrome bloqueia cookie de terceiro dentro de
 * iframe, então o cookie de domínio pai sozinho não chega aqui: o portal manda
 * a sessão pela URL e este bloco grava os cookies no próprio host.
 *
 * sameSite 'lax' é decisão registrada no plano (seção 7.6) e é o que roda em
 * produção no CRM e no Dashboard: o cookie é gravado pelo próprio host na
 * resposta do redirect que ele mesmo emitiu, então as requisições seguintes já
 * são same site. Não trocar por 'none'.
 */
function ingestStackToken(req: NextRequest): NextResponse | null {
  const stParam = req.nextUrl.searchParams.get("__st");
  if (!stParam) return null;

  try {
    const decoded = JSON.parse(Buffer.from(stParam, "base64").toString()) as {
      a?: string;
      rn?: string;
      rv?: string;
    };

    const cleanUrl = new URL(req.url);
    cleanUrl.searchParams.delete("__st");

    const res = NextResponse.redirect(cleanUrl);

    if (decoded.a) {
      // httpOnly false: o SDK client do Stack lê este cookie.
      res.cookies.set("stack-access", decoded.a, {
        path: "/",
        httpOnly: false,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
      });
    }
    if (decoded.rn && decoded.rv) {
      res.cookies.set(decoded.rn, decoded.rv, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return res;
  } catch (err) {
    // Token inválido nunca derruba a request: segue o fluxo normal de auth.
    console.error("Falha ao decodificar __st:", err);
    return null;
  }
}

/**
 * Corte anti bot: sem nenhum cookie de sessão do Stack, NÃO chamar o Stack
 * Auth. O projeto já estourou a cota de active users por chamar getUser em
 * request de crawler. Obrigatório manter.
 */
function hasStackSessionCookie(req: NextRequest): boolean {
  return req.cookies
    .getAll()
    .some(
      (c) =>
        c.name === "stack-access" ||
        c.name.startsWith("stack-refresh-") ||
        c.name.startsWith("__Host-stack-refresh-"),
    );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Ingestão do __st, antes de qualquer gate (acontece mesmo sem sessão).
  const ingested = ingestStackToken(req);
  if (ingested) return ingested;

  // 2. Rotas de login passam livres.
  if (isPublicPath(pathname)) return allow();

  // 3. Sessão Stack. O corte anti bot vem ANTES de tocar no Stack Auth.
  if (stackServerApp && hasStackSessionCookie(req)) {
    try {
      const user = await stackServerApp.getUser({
        tokenStore: req,
      });
      if (user) return allow();
    } catch (err) {
      console.error("Falha ao resolver a sessão Stack no middleware:", err);
    }
  }

  // 4. Com o Stack Auth configurado, as telas exigem sessão SEMPRE, sem
  //    fallback de senha: o isolamento por empresa depende do email, e senha
  //    compartilhada não tem email. Vale para /org/* e para a raiz, que lista
  //    as empresas do usuário.
  //
  //    Sem as env vars do Stack, NÃO redireciona: /handler/sign-in não teria
  //    como autenticar ninguém e o app inteiro ficaria inacessível, inclusive
  //    para a equipe interna. Nesse caso cai no gate de senha do passo 5, que
  //    é o que o .env.example promete.
  const isAppScreen =
    pathname === "/" || pathname === "/org" || pathname.startsWith("/org/");
  if (stackServerApp && isAppScreen) {
    return NextResponse.redirect(new URL("/handler/sign-in", req.url));
  }

  // 5. Fallback da transição: gate de senha atual. Ninguém perde acesso
  //    enquanto o SSO não estiver validado em produção (some na Fase 7).
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return allow();

  const token = req.cookies.get("dash_auth")?.value;
  if (token === password) return allow();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
