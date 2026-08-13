import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hashIP, isRateLimited, resetRateLimits } from "../lib/booking/rateLimit.js";
import { acquireLock, releaseLock } from "../lib/booking/lock.js";

describe("hashIP", () => {
  test("nunca retorna o IP em texto puro", () => {
    const hashed = hashIP("203.0.113.42");
    assert.ok(!hashed.includes("203.0.113.42"));
    assert.match(hashed, /^[a-f0-9]{16}$/);
  });

  test("é determinístico para o mesmo IP", () => {
    assert.equal(hashIP("203.0.113.42"), hashIP("203.0.113.42"));
  });
});

describe("isRateLimited", () => {
  test("bloqueia depois do limite configurado na mesma janela", () => {
    resetRateLimits();
    const key = "teste:rate";
    let blocked = false;
    for (let i = 0; i < 10; i++) {
      blocked = isRateLimited(key, { windowMs: 60000, max: 3 });
    }
    assert.equal(blocked, true);
  });

  test("não bloqueia dentro do limite", () => {
    resetRateLimits();
    const key = "teste:rate2";
    assert.equal(isRateLimited(key, { windowMs: 60000, max: 3 }), false);
    assert.equal(isRateLimited(key, { windowMs: 60000, max: 3 }), false);
  });
});

describe("acquireLock / releaseLock (proteção contra duplicidade)", () => {
  test("segunda tentativa pro MESMO horário falha enquanto a trava está ativa", () => {
    const key = "2026-08-20_09:00";
    assert.equal(acquireLock(key), true);
    assert.equal(acquireLock(key), false, "segunda reserva simultânea do mesmo horário deveria ser bloqueada");
    releaseLock(key);
  });

  test("depois de liberar, um novo acquire funciona de novo", () => {
    const key = "2026-08-21_10:00";
    assert.equal(acquireLock(key), true);
    releaseLock(key);
    assert.equal(acquireLock(key), true);
    releaseLock(key);
  });

  test("horários diferentes não se bloqueiam entre si", () => {
    assert.equal(acquireLock("2026-08-22_09:00"), true);
    assert.equal(acquireLock("2026-08-22_10:15"), true);
    releaseLock("2026-08-22_09:00");
    releaseLock("2026-08-22_10:15");
  });
});
