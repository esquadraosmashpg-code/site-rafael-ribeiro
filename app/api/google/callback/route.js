import { NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google/oauth";
import { escapeHtml } from "@/lib/security/html";
import { secureStateMatches } from "@/lib/security/state";

export const runtime = "nodejs";

const STATE_COOKIE = "g_oauth_state";

// Headers aplicados em TODA resposta desta rota (sucesso e erro) -- pagina
// administrativa de uso pontual, nunca deve ser cacheada por navegador nem
// por proxy/CDN intermediario, nem indexada.
const NO_CACHE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};

function htmlPage({ title, body }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,nofollow,noarchive"/>
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#101a30;color:#eef1f8;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.6}
  h1{font-size:1.3rem}
  code,pre{background:#1b2440;color:#f2d38c;padding:12px;border-radius:8px;display:block;overflow-x:auto;font-size:13px;word-break:break-all;white-space:pre-wrap}
  .warn{background:#3a1414;border:1px solid #8A1F1F;color:#f3c9c9;padding:12px;border-radius:8px;font-size:13px}
  a{color:#f2d38c}
</style>
</head>
<body>${body}</body>
</html>`;
}

function clearStateCookie(response) {
  response.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}

function htmlResponse(status, { title, body }) {
  return new NextResponse(htmlPage({ title, body }), { status, headers: NO_CACHE_HEADERS });
}

// Rota administrativa de uso pontual — ver comentario em
// app/api/google/authorize/route.js. Mesma trava por env var aqui.
export async function GET(request) {
  if (process.env.GOOGLE_OAUTH_SETUP_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Rota desativada." },
      { status: 404, headers: { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow, noarchive" } }
    );
  }

  const { searchParams } = new URL(request.url);
  const errorParam = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;

  if (errorParam) {
    return clearStateCookie(
      htmlResponse(400, {
        title: "Autorização cancelada",
        body: `<h1>Autorização cancelada</h1><p class="warn">O Google retornou: <code>${escapeHtml(errorParam)}</code></p>`,
      })
    );
  }

  // Cobre os 3 casos pedidos na auditoria: sem state, state que não bate
  // (CSRF/adulterado) e state expirado (o cookie HttpOnly já não existe
  // mais depois do maxAge de 10min, então cookieState vem undefined).
  if (!secureStateMatches(state, cookieState)) {
    return clearStateCookie(
      htmlResponse(400, {
        title: "State inválido",
        body: `<h1>⚠️ State inválido ou expirado</h1><p class="warn">Isso pode indicar CSRF, um link antigo (o state
          expira em 10 minutos) ou o fluxo foi reiniciado em outra aba. Comece de novo em
          <code>/api/google/authorize</code>.</p>`,
      })
    );
  }

  if (!code) {
    return clearStateCookie(
      htmlResponse(400, { title: "Código ausente", body: `<h1>Código de autorização ausente</h1>` })
    );
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch {
    // Nunca logar o erro completo aqui -- pode conter fragmento do code.
    console.error("[google-callback] falha ao trocar code por tokens");
    return clearStateCookie(
      htmlResponse(502, {
        title: "Falha na autorização",
        body: `<h1>Não foi possível concluir a autorização com o Google</h1>
          <p>Tente novamente em <code>/api/google/authorize</code>.</p>`,
      })
    );
  }

  if (!tokens.refresh_token) {
    return clearStateCookie(
      htmlResponse(200, {
        title: "Sem refresh token",
        body: `<h1>⚠️ O Google não devolveu um refresh token desta vez</h1>
          <p class="warn">Isso normalmente acontece quando essa conta já autorizou este app antes (o Google só
          manda o <code>refresh_token</code> na primeira vez). Revogue o acesso em
          <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> — procure
          "Agenda Rafael Ribeiro" — e recomece em <code>/api/google/authorize</code>.</p>`,
      })
    );
  }

  // So o refresh_token entra na pagina -- nunca access_token, client_id ou
  // client_secret, mesmo que venham juntos na resposta do Google.
  const body = `
    <h1>✅ Autorização concluída</h1>
    <p>Copie o <strong>refresh token</strong> abaixo agora — ele <u>não será mostrado de novo</u> e este site
    não guarda ele em nenhum lugar (nem log, nem banco, nem arquivo, nem cookie, nem localStorage).</p>
    <pre>${escapeHtml(tokens.refresh_token)}</pre>
    <p>Cole esse valor na variável <code>GOOGLE_REFRESH_TOKEN</code> em
    <strong>Vercel → Settings → Environment Variables</strong> do projeto (nunca no código, nunca no Git).</p>
    <p class="warn">Depois de salvar na Vercel: remova a variável <code>GOOGLE_OAUTH_SETUP_ENABLED</code>
    (ou deixe com valor diferente de <code>"true"</code>) e faça um novo deploy para desativar esta rota
    administrativa de novo.</p>`;

  return clearStateCookie(htmlResponse(200, { title: "Refresh token gerado", body }));
}
