import { ADMIN_COOKIE_NAME, verifySessionToken } from "./session.js";

// Confere a sessão administrativa a partir do cookie da requisição.
// Reutilizado por TODAS as rotas de /api/admin/agendamentos/* -- nenhuma
// delas confia em nada além disso pra saber se quem chamou está
// autenticado (nunca um header customizado, nunca query param).
export function hasValidAdminSession(request) {
  const token = request.cookies?.get?.(ADMIN_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}
