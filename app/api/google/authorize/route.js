import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthUrl } from "@/lib/google/oauth";

export const runtime = "nodejs";

const STATE_COOKIE = "g_oauth_state";

// Aplicado em toda resposta desta rota administrativa: nunca cachear (nem
// no navegador nem em proxy/CDN intermediario) e nunca indexar.
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};

// Rota administrativa de uso pontual (gerar o refresh token uma vez).
// Fica DESATIVADA por padrao -- so funciona com
// GOOGLE_OAUTH_SETUP_ENABLED=true nas variaveis de ambiente. Depois de
// gerar o refresh token, remova essa variavel (ou deixe diferente de
// "true") e faca um novo deploy pra desligar a rota de novo.
//
// Fluxo OFICIAL desta implantacao: essa rota so roda em producao (a URL
// de callback autorizada no Google Cloud e a de producao,
// https://site-rafael-ribeiro.vercel.app/api/google/callback). Nao existe
// fluxo local -- ver README.md > "Agenda propria".
export async function GET() {
  if (process.env.GOOGLE_OAUTH_SETUP_ENABLED !== "true") {
    return NextResponse.json({ error: "Rota desativada." }, { status: 404, headers: NO_CACHE_HEADERS });
  }

  let authUrl;
  const state = randomBytes(24).toString("hex");
  try {
    authUrl = buildAuthUrl(state);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }

  const response = NextResponse.redirect(authUrl, { headers: NO_CACHE_HEADERS });
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true, // fluxo oficial e so em producao (https) -- ver comentario acima
    sameSite: "lax",
    maxAge: 600, // 10 minutos, tempo de sobra pra completar o consentimento
    path: "/",
  });
  return response;
}
