import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createSessionToken,
  isAdminAuthConfigured,
  verifyAdminPassword,
} from "@/lib/admin/session";
import { hashIP, isRateLimited } from "@/lib/booking/rateLimit";
import { isAllowedOrigin, hasJsonContentType, readBodyWithLimit } from "@/lib/booking/httpGuards";
import { computeAdminLoginAttemptKey } from "@/lib/admin/loginAttemptKey";
import { consumeAdminLoginAttempt, registerAdminLoginSuccess } from "@/lib/admin/loginRateLimit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2_000;

// Mensagem ÚNICA para TODO caminho de recusa (senha errada, painel ainda
// não configurado nesse ambiente, ou limite de tentativas excedido --
// seja o limite em memória ou o persistente no Supabase) -- de propósito
// nunca diferencia esses casos. Um atacante (ou o próprio Rafael, se
// esquecer a senha) nunca consegue distinguir, pela resposta, "sua senha
// está errada" de "esse painel está bloqueado agora" de "essa variável
// de ambiente não está configurada".
const GENERIC_DENY_MESSAGE = "Não foi possível entrar. Verifique os dados ou tente novamente mais tarde.";

// Tempo TOTAL mínimo (do início da requisição até a resposta) que toda
// recusa deve levar. NÃO é um sleep fixo aplicado depois do
// processamento -- é medido a partir de `startedAt` (capturado como a
// primeira coisa que o handler faz) e a espera é só a DIFERENÇA entre
// esse mínimo e o quanto já se passou. Isso importa porque os caminhos
// de recusa têm custo de processamento bem diferente entre si: recusar
// por rate limit em memória é quase instantâneo; recusar por limite
// persistente exige uma ida e volta de rede até o Supabase (RPC
// admin_login_consume_attempt), que sozinha já pode levar dezenas de
// milissegundos; recusar por senha errada envolve ainda comparar hash
// com timingSafeEqual. Um sleep fixo somado DEPOIS de cada um desses
// caminhos não igualaria o tempo TOTAL de resposta entre eles -- o
// caminho que já gastou mais tempo internamente continuaria demorando
// mais no total, vazando (por timing) qual dos caminhos foi tomado.
// Preenchendo até um piso mínimo contado desde o início, o tempo total
// fica uniforme independentemente de qual caminho gastou quanto.
const MIN_TOTAL_RESPONSE_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// Toda recusa relacionada a autenticação (rate limit em memória, rate
// limit persistente, config ausente, senha errada) passa por aqui --
// garante a MESMA mensagem, o MESMO status (401) e o MESMO tempo TOTAL
// de resposta (contado desde `startedAt`) em qualquer um dos casos.
async function denyUniformly(startedAt) {
  const elapsed = Date.now() - startedAt;
  const remaining = MIN_TOTAL_RESPONSE_MS - elapsed;
  if (remaining > 0) await sleep(remaining);
  return jsonNoStore({ error: GENERIC_DENY_MESSAGE }, { status: 401 });
}

function getClientIP(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

// POST /api/admin/agendamentos/login
// Body: { senha }. Nunca loga a senha (nem em sucesso nem em falha), nem
// o cookie gerado, nem o corpo da requisição, nem o IP, nem a
// attempt_key derivada dele. Nunca devolve a senha configurada de volta
// em nenhuma resposta.
//
// Fluxo (ver supabase/migrations/0002_admin_login_rate_limit.sql -- essa
// migration ainda é uma PROPOSTA, não aplicada em nenhum Supabase real;
// enquanto não for aplicada manualmente, os passos que chamam
// consumeAdminLoginAttempt/registerAdminLoginSuccess vão falhar com
// "função não encontrada" -- tratado abaixo como falha fechada, nunca
// como sucesso):
//   a) calcula a attempt_key (HMAC do IP confiável);
//   b) consome uma tentativa no limite persistente (ANTES de comparar
//      senha -- o consumo em si já conta, allowed ou não);
//   c) se não permitido, espera o tempo mínimo uniforme e responde a
//      recusa genérica;
//   d) só se permitido, lê o corpo e compara a senha;
//   e) se correta, reseta o limite persistente e cria a sessão;
//   f) se incorreta, NÃO chama o consumo de novo -- já foi contado no
//      passo (b).
export async function POST(request) {
  const startedAt = Date.now();

  // Guardas de protocolo (Origin/Content-Type) ficam FORA da
  // uniformização de tempo/mensagem -- não são parte do "oráculo de
  // senha": não revelam nada sobre a senha, a configuração ou o estado
  // de bloqueio, só rejeitam requisições estruturalmente inválidas
  // (ex.: um outro site tentando enviar o formulário).
  if (!isAllowedOrigin(request)) {
    return jsonNoStore({ error: "Requisição não permitida." }, { status: 403 });
  }
  if (!hasJsonContentType(request)) {
    return jsonNoStore({ error: "Content-Type inválido." }, { status: 415 });
  }

  // Primeira barreira, rápida e só em memória -- evita gastar uma
  // consulta ao Supabase em floods óbvios vindos da MESMA instância
  // serverless. Não é mais a barreira AUTORITATIVA (ver limitação
  // documentada em lib/booking/rateLimit.js: não é compartilhada entre
  // instâncias) -- quem decide de verdade, de forma consistente entre
  // instâncias, é o limite persistente no Supabase, chamado logo a
  // seguir.
  const ipKeyMemoria = hashIP(getClientIP(request));
  if (isRateLimited(`admin-login:${ipKeyMemoria}`, { windowMs: 60_000, max: 5 })) {
    return denyUniformly(startedAt);
  }

  if (!isAdminAuthConfigured()) {
    return denyUniformly(startedAt);
  }

  // (a) attempt_key -- HMAC-SHA-256(BOOKING_ADMIN_SESSION_SECRET,
  // "admin-login:" + IP normalizado). Nunca null aqui na prática (já
  // validamos isAdminAuthConfigured(), que já garante o segredo
  // presente e com tamanho mínimo), mas tratado defensivamente mesmo
  // assim -- ausência de segredo nunca deve virar um crash 500.
  const attemptKey = computeAdminLoginAttemptKey(request);
  if (!attemptKey) {
    return denyUniformly(startedAt);
  }

  // (b) consumo atômico do limite persistente -- conta a tentativa
  // ANTES de qualquer comparação de senha. Qualquer falha na chamada
  // (Supabase fora do ar, migration ainda não aplicada, credenciais
  // erradas) é tratada como recusa -- falha fechada, nunca abre o
  // painel só porque o limitador persistente não respondeu.
  let consumo;
  try {
    consumo = await consumeAdminLoginAttempt(attemptKey);
  } catch (err) {
    console.error("[admin-login] erro ao consultar limite de tentativas:", err.message);
    return denyUniformly(startedAt);
  }

  // (c) já bloqueado (ou erro tratado como bloqueio) -- recusa sem
  // sequer olhar o corpo da requisição.
  if (!consumo.allowed) {
    return denyUniformly(startedAt);
  }

  const rawBody = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    return jsonNoStore({ error: "Corpo da requisição excede o tamanho permitido." }, { status: 413 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonNoStore({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  // (d) só chega aqui se o passo (b) permitiu -- compara a senha.
  const senha = typeof payload?.senha === "string" ? payload.senha : "";
  if (!verifyAdminPassword(senha)) {
    // (f) senha errada -- NÃO consome outra tentativa: já foi contada
    // no passo (b), independentemente do resultado da comparação.
    return denyUniformly(startedAt);
  }

  // (e) sucesso -- reseta o limite persistente. Falha aqui não impede o
  // login (já é legítimo); só significa que a próxima pessoa a tentar
  // começa com um contador que ainda não zerou -- pior caso é uma
  // recusa a mais, nunca uma falha de segurança.
  try {
    await registerAdminLoginSuccess(attemptKey);
  } catch (err) {
    console.error("[admin-login] erro ao resetar limite de tentativas:", err.message);
  }

  const token = createSessionToken();
  const response = jsonNoStore({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
