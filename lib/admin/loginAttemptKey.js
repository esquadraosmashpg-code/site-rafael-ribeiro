// Deriva a `attempt_key` usada pelo limite de tentativas persistente do
// login admin (ver supabase/migrations/0002_admin_login_rate_limit.sql).
//
// POR QUE HMAC E NÃO UM HASH SIMPLES (SHA-256 puro): um endereço IPv4
// só tem 2^32 valores possíveis -- um atacante com acesso de leitura à
// tabela `admin_login_attempts` (ex.: um vazamento, um bug de RLS em
// outro lugar, um dump de backup) poderia pré-computar o SHA-256 de
// TODOS os IPv4 existentes (uma "rainbow table" completa é totalmente
// viável nesse espaço) e descobrir exatamente qual IP corresponde a
// qual `attempt_key` só olhando os valores gravados -- sem nunca ter
// acessado a aplicação. HMAC-SHA-256, com uma chave secreta de 64 bytes
// que só existe no servidor (BOOKING_ADMIN_SESSION_SECRET), torna essa
// pré-computação inviável: sem o segredo, ninguém reconstrói o IP a
// partir da chave gravada, mesmo com leitura total da tabela.
//
// Reaproveita BOOKING_ADMIN_SESSION_SECRET (o mesmo segredo que já
// assina o cookie de sessão em lib/admin/session.js) em vez de exigir
// mais uma variável de ambiente nova -- HMAC com a mesma chave, para
// dois propósitos com mensagens de entrada estruturalmente diferentes
// ("admin-login:" + IP normalizado, versus o payload JSON do cookie de
// sessão), não enfraquece nenhum dos dois usos.
import { createHmac } from "node:crypto";
import { getAdminLoginIdentifier } from "./clientIp.js";

const MIN_SECRET_LENGTH = 32; // mesmo mínimo exigido em lib/admin/session.js

// Calcula a attempt_key a partir da requisição. Retorna null se o
// segredo não estiver configurado (ou for curto demais) -- o chamador
// deve tratar isso como "recusa genérica", nunca tentar prosseguir sem
// uma chave segura.
export function computeAdminLoginAttemptKey(request) {
  const secret = process.env.BOOKING_ADMIN_SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;

  const identifier = getAdminLoginIdentifier(request);
  return createHmac("sha256", secret).update(`admin-login:${identifier}`).digest("hex");
}
