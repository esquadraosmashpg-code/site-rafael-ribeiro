import { timingSafeEqual } from "node:crypto";

// Comparacao de tempo constante entre o state recebido (query string) e o
// esperado (cookie HttpOnly) -- evita vazar, por diferenca de tempo de
// resposta, quanto do state um atacante acertou. Tamanhos diferentes sao
// tratados como invalido sem lancar excecao (timingSafeEqual exige
// buffers do mesmo tamanho).
export function secureStateMatches(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
