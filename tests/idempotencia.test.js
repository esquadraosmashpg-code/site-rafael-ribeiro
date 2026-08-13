import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildRequestSignature,
  reserveAttempt,
  resetIdempotencyCache,
  IdempotencyStatus,
} from "../lib/booking/idempotency.js";

const sigPadrao = () =>
  buildRequestSignature({ modalidade: "online", data: "2026-08-20", horario: "08:00", email: "a@b.com" });

describe("reserveAttempt -- chave nunca vista antes", () => {
  beforeEach(resetIdempotencyCache);

  test("retorna 'proceed' com finish() disponível", async () => {
    const attempt = await reserveAttempt("chave-nova", sigPadrao());
    assert.equal(attempt.outcome, "proceed");
    assert.equal(typeof attempt.finish, "function");
  });

  test("sem idempotencyKey (null), sempre 'proceed' (sem dedupe possível)", async () => {
    const attempt = await reserveAttempt(null, sigPadrao());
    assert.equal(attempt.outcome, "proceed");
    assert.doesNotThrow(() => attempt.finish(IdempotencyStatus.SUCCEEDED, { ok: true }));
  });
});

describe("reserveAttempt -- mesma chave, mesmo pedido, sucesso anterior", () => {
  beforeEach(resetIdempotencyCache);

  test("devolve a MESMA resposta, sem exigir nova criação", async () => {
    const sig = sigPadrao();
    const primeira = await reserveAttempt("chave-1", sig);
    assert.equal(primeira.outcome, "proceed");
    const resposta = { publicId: "AGD-UNICO", meetLink: "https://meet.google.com/xyz" };
    primeira.finish(IdempotencyStatus.SUCCEEDED, resposta);

    const retry1 = await reserveAttempt("chave-1", sig);
    const retry2 = await reserveAttempt("chave-1", sig);
    assert.equal(retry1.outcome, "succeeded");
    assert.deepEqual(retry1.response, resposta);
    assert.equal(retry2.outcome, "succeeded");
    assert.deepEqual(retry2.response, resposta);
  });
});

describe("reserveAttempt -- mesma chave, payload DIFERENTE (item 3 da auditoria)", () => {
  beforeEach(resetIdempotencyCache);

  test("responde 'conflict' -- nunca reaproveita nem sobrescreve a tentativa original", async () => {
    const sigOriginal = sigPadrao();
    const sigDiferente = buildRequestSignature({
      modalidade: "online",
      data: "2026-08-21",
      horario: "11:00",
      email: "a@b.com",
    });

    const primeira = await reserveAttempt("chave-2", sigOriginal);
    primeira.finish(IdempotencyStatus.SUCCEEDED, { publicId: "AGD-PRIMEIRO" });

    const segunda = await reserveAttempt("chave-2", sigDiferente);
    assert.equal(segunda.outcome, "conflict");
  });

  test("'conflict' acontece mesmo enquanto a primeira ainda está em PROCESSING", async () => {
    const sigOriginal = sigPadrao();
    const sigDiferente = buildRequestSignature({
      modalidade: "presencial",
      data: "2026-08-20",
      horario: "08:00",
      email: "a@b.com",
    });
    const primeira = await reserveAttempt("chave-3", sigOriginal);
    assert.equal(primeira.outcome, "proceed");
    // não chama finish() ainda -- fica "em processamento"
    const segunda = await reserveAttempt("chave-3", sigDiferente);
    assert.equal(segunda.outcome, "conflict");
    primeira.finish(IdempotencyStatus.SUCCEEDED, { publicId: "X" });
  });
});

describe("reserveAttempt -- estados FAILED_SAFE e UNKNOWN", () => {
  beforeEach(resetIdempotencyCache);

  test("FAILED_SAFE libera a chave -- próxima tentativa começa do zero (outcome 'proceed' de novo)", async () => {
    const sig = sigPadrao();
    const primeira = await reserveAttempt("chave-4", sig);
    primeira.finish(IdempotencyStatus.FAILED_SAFE);

    const segunda = await reserveAttempt("chave-4", sig);
    assert.equal(segunda.outcome, "proceed", "falha segura deveria permitir tentativa nova");
  });

  test("UNKNOWN NÃO permite retry automático -- outcome 'unknown', nunca repete cego", async () => {
    const sig = sigPadrao();
    const primeira = await reserveAttempt("chave-5", sig);
    primeira.finish(IdempotencyStatus.UNKNOWN);

    const segunda = await reserveAttempt("chave-5", sig);
    assert.equal(segunda.outcome, "unknown");
  });
});

describe("reserveAttempt -- concorrência real (Promise.all, item 3 da auditoria)", () => {
  beforeEach(resetIdempotencyCache);

  test("duas tentativas concorrentes com a MESMA chave: a função de criação é chamada só UMA vez", async () => {
    const sig = sigPadrao();
    let chamadasDeCriacao = 0;

    async function tentativaDeConfirmar() {
      const attempt = await reserveAttempt("chave-concorrente", sig);
      if (attempt.outcome !== "proceed") return attempt;

      chamadasDeCriacao++;
      // simula a chamada de escrita ao Google demorando um pouco --
      // é exatamente essa janela que a segunda tentativa concorrente
      // precisa "esperar" em vez de disparar a sua própria criação.
      await new Promise((resolve) => setTimeout(resolve, 15));
      const response = { publicId: "AGD-CONCORRENTE" };
      attempt.finish(IdempotencyStatus.SUCCEEDED, response);
      return { outcome: "succeeded", response };
    }

    const [r1, r2] = await Promise.all([tentativaDeConfirmar(), tentativaDeConfirmar()]);

    assert.equal(chamadasDeCriacao, 1, "a criação do evento no Google deveria acontecer uma única vez");
    assert.equal(r1.outcome, "succeeded");
    assert.equal(r2.outcome, "succeeded");
    assert.deepEqual(r1.response, r2.response);
  });

  test("três tentativas concorrentes, mesma chave: ainda assim só uma criação", async () => {
    const sig = sigPadrao();
    let chamadas = 0;

    async function tentativa() {
      const attempt = await reserveAttempt("chave-tripla", sig);
      if (attempt.outcome !== "proceed") return attempt;
      chamadas++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      const response = { publicId: "AGD-TRIPLA" };
      attempt.finish(IdempotencyStatus.SUCCEEDED, response);
      return { outcome: "succeeded", response };
    }

    const resultados = await Promise.all([tentativa(), tentativa(), tentativa()]);
    assert.equal(chamadas, 1);
    for (const r of resultados) {
      assert.equal(r.outcome, "succeeded");
      assert.equal(r.response.publicId, "AGD-TRIPLA");
    }
  });

  test("concorrência com resultado FAILED_SAFE: a segunda tentativa assume e tenta de novo (não fica travada)", async () => {
    const sig = sigPadrao();
    let chamadas = 0;

    async function primeiraFalhaSegura() {
      const attempt = await reserveAttempt("chave-recover", sig);
      if (attempt.outcome !== "proceed") return attempt;
      chamadas++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      attempt.finish(IdempotencyStatus.FAILED_SAFE);
      return { outcome: "failed-safe" };
    }

    async function segundaQueDeveSucedeer() {
      // começa levemente depois, pra cair no ramo "aguarda a promise
      // existente" antes da primeira terminar
      await new Promise((resolve) => setTimeout(resolve, 2));
      const attempt = await reserveAttempt("chave-recover", sig);
      if (attempt.outcome !== "proceed") return attempt;
      chamadas++;
      const response = { publicId: "AGD-RECUPEROU" };
      attempt.finish(IdempotencyStatus.SUCCEEDED, response);
      return { outcome: "succeeded", response };
    }

    const [, r2] = await Promise.all([primeiraFalhaSegura(), segundaQueDeveSucedeer()]);
    assert.equal(r2.outcome, "succeeded");
    assert.equal(chamadas, 2, "a primeira tentou e falhou seguro, a segunda deveria conseguir tentar de novo");
  });
});

describe("buildRequestSignature", () => {
  test("muda se qualquer campo relevante mudar", () => {
    const base = { modalidade: "online", data: "2026-08-20", horario: "08:00", email: "a@b.com" };
    const sigBase = buildRequestSignature(base);
    assert.notEqual(sigBase, buildRequestSignature({ ...base, modalidade: "presencial" }));
    assert.notEqual(sigBase, buildRequestSignature({ ...base, data: "2026-08-21" }));
    assert.notEqual(sigBase, buildRequestSignature({ ...base, horario: "11:00" }));
    assert.notEqual(sigBase, buildRequestSignature({ ...base, email: "outro@b.com" }));
  });
});
