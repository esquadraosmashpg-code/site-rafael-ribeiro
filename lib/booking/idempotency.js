import { createHash } from "node:crypto";

// Registro de idempotência em memória, por instância do processo
// serverless.
//
// LIMITAÇÃO IMPORTANTE (documentada conforme pedido): isso NÃO é um
// registro distribuído. Numa plataforma serverless como a Vercel, cada
// instância da função tem sua própria memória -- se uma segunda
// requisição com a mesma chave cair numa instância "fria" diferente da
// que está processando a primeira, este módulo não vai saber da outra e
// as duas seguem em paralelo (a defesa real contra DUAS criações de
// evento nesse cenário entre instâncias continua sendo a segunda checagem
// de disponibilidade via freeBusy, que impede duas reservas do MESMO
// horário -- não impede, em tese, dois eventos se a colisão for
// exatamente na mesma janela de corrida entre instâncias diferentes). Pra
// eliminar de vez a corrida distribuída seria necessário um
// armazenamento externo compartilhado com lock atômico (ex.: Vercel KV,
// Redis com SETNX) -- fora do escopo desta etapa, sem introduzir
// banco/serviço novo. DENTRO de uma mesma instância, porém, a proteção é
// real: Node.js é single-threaded, então o par checar+escrever no Map
// abaixo é sempre atômico entre requisições concorrentes dessa instância,
// e uma segunda requisição com a mesma chave literalmente aguarda a
// MESMA Promise da primeira em vez de iniciar uma criação paralela.
export const IdempotencyStatus = Object.freeze({
  PROCESSING: "PROCESSING",
  SUCCEEDED: "SUCCEEDED",
  // Falhou ANTES de qualquer chamada de escrita ao Google -- seguro
  // liberar a chave pra uma tentativa nova do zero.
  FAILED_SAFE: "FAILED_SAFE",
  // Falhou DURANTE/DEPOIS da chamada de escrita ao Google, sem
  // confirmação clara do resultado (ex.: timeout de rede) -- nunca repete
  // cegamente, porque o evento pode ter sido criado do lado do Google
  // mesmo a resposta não tendo chegado aqui.
  UNKNOWN: "UNKNOWN",
});

const store = new Map(); // key -> { signature, status, response, promise, expiresAt }
const DEFAULT_TTL_MS = 5 * 60_000; // 5 minutos e tempo de sobra pra qualquer retry razoável

function cleanupExpired(now) {
  if (store.size < 500) return; // limpeza oportunista, não a cada chamada
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

// Assinatura curta do que está sendo pedido -- garante que a MESMA
// idempotencyKey só é tratada como "a mesma tentativa" se o pedido em si
// também for o mesmo (modalidade/data/horário/e-mail).
export function buildRequestSignature({ modalidade, data, horario, email }) {
  return createHash("sha256").update(`${modalidade}|${data}|${horario}|${email}`).digest("hex");
}

// Tenta reservar o direito de processar essa (chave, assinatura). Nunca
// lança. Resultado é um destes formatos:
//
//   { outcome: "conflict" }
//     A mesma chave já foi usada com um pedido DIFERENTE -- rota deve
//     responder 409, nunca reaproveitar nem sobrescrever.
//
//   { outcome: "succeeded", response }
//     Essa tentativa já tinha terminado com sucesso antes -- rota deve
//     devolver a MESMA resposta, sem criar evento novo.
//
//   { outcome: "unknown" }
//     A tentativa anterior terminou em estado incerto (ver
//     IdempotencyStatus.UNKNOWN) -- rota NÃO deve tentar de novo
//     automaticamente; deve orientar a pessoa a aguardar antes de
//     reenviar.
//
//   { outcome: "proceed", finish }
//     Ninguém mais está processando essa chave agora -- quem chamou deve
//     seguir com o fluxo normal e OBRIGATORIAMENTE chamar
//     finish(status, response?) no final (sucesso ou qualquer erro),
//     senão a chave fica presa em PROCESSING até expirar pelo TTL.
export async function reserveAttempt(idempotencyKey, signature, ttlMs = DEFAULT_TTL_MS) {
  if (!idempotencyKey) {
    // Sem chave, não tem dedupe possível -- comportamento antigo (sempre
    // "prossiga", finish() é só um no-op).
    return { outcome: "proceed", finish: () => {} };
  }

  const now = Date.now();
  cleanupExpired(now);
  const existing = store.get(idempotencyKey);

  if (existing && existing.expiresAt > now) {
    if (existing.signature !== signature) {
      return { outcome: "conflict" };
    }
    if (existing.status === IdempotencyStatus.PROCESSING) {
      // Aguarda a MESMA Promise em andamento -- nunca dispara uma
      // segunda criação concorrente pra essa chave dentro desta
      // instância. Ver comentário de limitação no topo do arquivo sobre
      // instâncias diferentes.
      const resultado = await existing.promise;
      if (resultado.outcome === "failed-safe") {
        // A tentativa que estávamos esperando falhou de forma segura e
        // já liberou a chave -- essa chamada vira a nova "primeira"
        // tentativa.
        return reserveAttempt(idempotencyKey, signature, ttlMs);
      }
      return resultado;
    }
    if (existing.status === IdempotencyStatus.SUCCEEDED) {
      return { outcome: "succeeded", response: existing.response };
    }
    if (existing.status === IdempotencyStatus.UNKNOWN) {
      return { outcome: "unknown" };
    }
    // FAILED_SAFE não deveria sobrar registrado (é removido no finish),
    // mas se sobrar por algum motivo, cai pro fluxo de baixo e começa uma
    // tentativa nova.
  }

  let resolveWaiting;
  const promise = new Promise((resolve) => {
    resolveWaiting = resolve;
  });
  store.set(idempotencyKey, {
    signature,
    status: IdempotencyStatus.PROCESSING,
    response: null,
    promise,
    expiresAt: now + ttlMs,
  });

  function finish(status, response) {
    if (status === IdempotencyStatus.FAILED_SAFE) {
      // Falha segura: libera a chave de vez, permite tentativa nova do
      // zero (não precisa nem ficar registrada).
      store.delete(idempotencyKey);
      resolveWaiting({ outcome: "failed-safe" });
      return;
    }

    const entry = store.get(idempotencyKey);
    if (entry) {
      entry.status = status;
      entry.response = response ?? null;
      entry.promise = null;
    }

    const resultado =
      status === IdempotencyStatus.SUCCEEDED
        ? { outcome: "succeeded", response }
        : { outcome: "unknown" }; // status === UNKNOWN
    resolveWaiting(resultado);
  }

  return { outcome: "proceed", finish };
}

// Util pra testes.
export function resetIdempotencyCache() {
  store.clear();
}
