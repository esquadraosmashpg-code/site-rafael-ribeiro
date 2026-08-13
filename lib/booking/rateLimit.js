import { createHash } from "node:crypto";

// Rate limit simples, em memoria, por instancia do processo serverless.
//
// LIMITACAO IMPORTANTE (documentada conforme pedido): a Vercel roda
// funcoes serverless em multiplas instancias e regioes; esse contador
// NAO e compartilhado entre elas. Ou seja, o limite real efetivo pode
// ser maior que o configurado se o trafego cair em instancias diferentes,
// e o contador zera a cada cold start. Isso e uma mitigacao de V1, nao
// uma protecao rigorosa contra abuso distribuido. Para um limite
// realmente confiavel seria necessario um armazenamento externo
// compartilhado (ex.: Vercel KV, Upstash Redis) -- fora do escopo da V1
// para nao adicionar servico pago.
const buckets = new Map();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 5;

// Nunca guardamos o IP em texto puro em memoria nem em log -- so um hash
// truncado, que nao e reversivel para o IP original.
export function hashIP(ip) {
  return createHash("sha256").update(String(ip || "unknown")).digest("hex").slice(0, 16);
}

// Retorna true se a requisicao associada a `key` deve ser BLOQUEADA
// (excedeu o limite na janela de tempo).
export function isRateLimited(key, { windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX } = {}) {
  const now = Date.now();
  const previous = buckets.get(key) || [];
  const recent = previous.filter((timestamp) => now - timestamp < windowMs);
  recent.push(now);
  buckets.set(key, recent);

  // Limpeza oportunista para nao vazar memoria indefinidamente ao longo
  // da vida da instancia.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((timestamp) => now - timestamp > windowMs)) buckets.delete(k);
    }
  }

  return recent.length > max;
}

// Util para testes: limpa todos os contadores.
export function resetRateLimits() {
  buckets.clear();
}
