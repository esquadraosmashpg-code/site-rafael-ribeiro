import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/admin/session";
import { isAllowedOrigin } from "@/lib/booking/httpGuards";

export const runtime = "nodejs";

function jsonNoStore(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init.headers,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

// POST /api/admin/agendamentos/logout -- encerra a sessão limpando o
// cookie. Não exige sessão válida pra funcionar (encerrar uma sessão já
// inválida/expirada não é um problema). Ainda assim valida a Origin --
// defesa em profundidade contra CSRF, complementar ao SameSite=Strict do
// próprio cookie (que já bloqueia o vetor principal desse ataque).
export async function POST(request) {
  if (!isAllowedOrigin(request)) {
    return jsonNoStore({ error: "Requisição não permitida." }, { status: 403 });
  }

  const response = jsonNoStore({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
