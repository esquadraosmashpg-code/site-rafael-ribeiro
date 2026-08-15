// Sessão administrativa do painel /admin/agendamentos -- sem tabela de
// sessões (fica dentro do orçamento gratuito): o "token" é um cookie
// assinado com HMAC-SHA256 (BOOKING_ADMIN_SESSION_SECRET), contendo só um
// prazo de expiração. Verificar a sessão é só recalcular a assinatura e
// comparar em tempo constante -- não precisa de nenhuma consulta a banco.
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE_NAME = "booking_admin_session";

// Sessão curta de propósito -- é um painel de uso ocasional (algumas
// confirmações por dia), não uma sessão de trabalho contínuo.
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas
export const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

// Tamanho mínimo aceito pro segredo de assinatura -- um segredo curto
// (ex.: "123" ou uma palavra comum) tornaria a assinatura HMAC
// forjável por força bruta em tempo viável. 32 caracteres é o mínimo
// prático mesmo pra um segredo de baixa entropia por caractere; o
// README orienta gerar algo bem mais aleatório que isso.
const MIN_SESSION_SECRET_LENGTH = 32;

function getSecret() {
  const secret = process.env.BOOKING_ADMIN_SESSION_SECRET;
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
    // Mesma mensagem tanto pra "ausente" quanto pra "curto demais" --
    // não é útil pra um atacante saber qual dos dois é o caso, e pro
    // operador a ação corretiva é a mesma (gerar um segredo novo, mais
    // longo).
    throw new Error("BOOKING_ADMIN_SESSION_SECRET não configurado ou curto demais (mínimo 32 caracteres).");
  }
  return secret;
}

function sign(payloadB64) {
  return createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

// Compara duas strings em tempo constante. Hasheia os dois lados primeiro
// pra igualar sempre o tamanho do buffer comparado -- timingSafeEqual
// exige buffers do MESMO tamanho, e nem o comprimento da senha digitada
// deveria vazar por timing.
export function safeCompare(a, b) {
  const ha = createHash("sha256").update(String(a ?? "")).digest();
  const hb = createHash("sha256").update(String(b ?? "")).digest();
  return timingSafeEqual(ha, hb);
}

// Nunca autentica se a senha não estiver configurada (nunca "abre" o
// painel por acidente num ambiente sem BOOKING_ADMIN_PASSWORD definido).
export function verifyAdminPassword(candidate) {
  const expected = process.env.BOOKING_ADMIN_PASSWORD;
  if (!expected) return false;
  return safeCompare(candidate, expected);
}

export function isAdminAuthConfigured() {
  return Boolean(
    process.env.BOOKING_ADMIN_PASSWORD &&
      process.env.BOOKING_ADMIN_SESSION_SECRET &&
      process.env.BOOKING_ADMIN_SESSION_SECRET.length >= MIN_SESSION_SECRET_LENGTH
  );
}

export function createSessionToken(now = Date.now()) {
  const payloadB64 = Buffer.from(JSON.stringify({ exp: now + SESSION_TTL_MS })).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

// Verifica um token de sessão (o valor bruto do cookie). Nunca lança --
// qualquer formato inesperado simplesmente resulta em sessão inválida.
export function verifySessionToken(token, now = Date.now()) {
  if (typeof token !== "string") return false;
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0) return false;
  const payloadB64 = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!payloadB64 || !signature) return false;

  let expectedBuf, signatureBuf;
  try {
    expectedBuf = Buffer.from(sign(payloadB64));
    signatureBuf = Buffer.from(signature);
  } catch {
    return false;
  }
  if (expectedBuf.length !== signatureBuf.length || !timingSafeEqual(expectedBuf, signatureBuf)) {
    return false;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  return typeof payload?.exp === "number" && payload.exp > now;
}
