import { NextResponse } from "next/server";

// Reforça, via HEADER HTTP real (além da <meta name="robots"> já presente
// em app/admin/agendamentos/page.js), que o painel administrativo nunca
// deve ser indexado nem cacheado -- inclusive por qualquer proxy/CDN no
// caminho, que olha pra header antes de renderizar HTML.
//
// Nota: Next.js 16 vem renomeando essa convenção de `middleware.js` pra
// `proxy.js` (gera um aviso de depreciação no build, sem quebrar nada) --
// mantido como `middleware.js` por enquanto porque é a forma ainda
// documentada e estável na versão instalada neste projeto.
export function middleware(request) {
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
