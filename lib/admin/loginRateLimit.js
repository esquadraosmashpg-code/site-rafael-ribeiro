// Camada fina sobre as RPCs de supabase/migrations/0002_admin_login_rate_limit.sql
// (PROPOSTA -- ainda não aplicada em nenhum Supabase real). Mesmo padrão
// de lib/booking/bookingRepository.js: o resto do código nunca chama
// supabaseRpc diretamente para isto.
import { supabaseRpc } from "../supabase/client.js";

function firstRow(result) {
  return Array.isArray(result) ? result[0] : result;
}

// Consome uma tentativa de login (incrementa o contador ANTES de
// qualquer comparação de senha) e devolve { allowed, remainingAttempts }.
// Nunca lança por "bloqueado" -- isso é um resultado normal
// (allowed=false), não uma exceção. Só lança se a chamada ao Supabase
// falhar de verdade (rede, credenciais, função ausente) -- o chamador
// deve tratar qualquer erro daqui como recusa (falha fechada).
export async function consumeAdminLoginAttempt(attemptKey) {
  const result = await supabaseRpc("admin_login_consume_attempt", { p_attempt_key: attemptKey });
  const row = firstRow(result);
  return {
    allowed: Boolean(row?.allowed),
    remainingAttempts: typeof row?.remaining_attempts === "number" ? row.remaining_attempts : 0,
  };
}

// Reseta o contador após um login bem-sucedido.
export async function registerAdminLoginSuccess(attemptKey) {
  await supabaseRpc("admin_login_register_success", { p_attempt_key: attemptKey });
}
