import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  verifySessionToken,
  verifyAdminPassword,
  isAdminAuthConfigured,
  safeCompare,
  SESSION_TTL_SECONDS,
} from "../lib/admin/session.js";

const originalEnv = { ...process.env };

// >= 32 caracteres, o mínimo aceito (ver MIN_SESSION_SECRET_LENGTH em
// lib/admin/session.js).
const SEGREDO_VALIDO = "segredo-de-assinatura-bem-longo-e-valido";

beforeEach(() => {
  process.env.BOOKING_ADMIN_PASSWORD = "senha-super-secreta";
  process.env.BOOKING_ADMIN_SESSION_SECRET = SEGREDO_VALIDO;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("safeCompare", () => {
  test("true para valores iguais", () => {
    assert.equal(safeCompare("abc123", "abc123"), true);
  });
  test("false para valores diferentes, inclusive tamanhos diferentes", () => {
    assert.equal(safeCompare("abc", "abcd"), false);
    assert.equal(safeCompare("abc", "xyz"), false);
  });
});

describe("verifyAdminPassword", () => {
  test("aceita a senha correta", () => {
    assert.equal(verifyAdminPassword("senha-super-secreta"), true);
  });
  test("rejeita senha errada", () => {
    assert.equal(verifyAdminPassword("senha-errada"), false);
  });
  test("nunca autentica se BOOKING_ADMIN_PASSWORD não estiver configurada", () => {
    delete process.env.BOOKING_ADMIN_PASSWORD;
    assert.equal(verifyAdminPassword("qualquer-coisa"), false);
    assert.equal(verifyAdminPassword(""), false);
  });
});

describe("isAdminAuthConfigured", () => {
  test("true só quando as duas variáveis estão presentes e o segredo tem tamanho mínimo", () => {
    assert.equal(isAdminAuthConfigured(), true);
    delete process.env.BOOKING_ADMIN_SESSION_SECRET;
    assert.equal(isAdminAuthConfigured(), false);
  });

  test("false quando o segredo é mais curto que 32 caracteres (fail-closed contra segredo fraco)", () => {
    process.env.BOOKING_ADMIN_SESSION_SECRET = "curto-demais";
    assert.equal(isAdminAuthConfigured(), false);
  });

  test("true no limite exato de 32 caracteres", () => {
    process.env.BOOKING_ADMIN_SESSION_SECRET = "a".repeat(32);
    assert.equal(isAdminAuthConfigured(), true);
  });

  test("false com 31 caracteres (um a menos que o mínimo)", () => {
    process.env.BOOKING_ADMIN_SESSION_SECRET = "a".repeat(31);
    assert.equal(isAdminAuthConfigured(), false);
  });
});

describe("Segredo curto: nunca gera/aceita sessão, sempre falha fechado", () => {
  test("verifySessionToken com segredo curto demais retorna false sem lançar exceção", () => {
    const token = createSessionToken(); // gerado com o segredo válido do beforeEach
    process.env.BOOKING_ADMIN_SESSION_SECRET = "curto";
    assert.doesNotThrow(() => verifySessionToken(token));
    assert.equal(verifySessionToken(token), false);
  });
});

describe("createSessionToken / verifySessionToken", () => {
  test("token recém-criado é válido", () => {
    const token = createSessionToken();
    assert.equal(verifySessionToken(token), true);
  });

  test("token expira depois do TTL", () => {
    const now = Date.now();
    const token = createSessionToken(now);
    assert.equal(verifySessionToken(token, now + SESSION_TTL_SECONDS * 1000 + 1000), false);
    assert.equal(verifySessionToken(token, now + 1000), true);
  });

  test("token adulterado (assinatura não bate) é rejeitado", () => {
    const token = createSessionToken();
    const adulterado = token.slice(0, -2) + "xx";
    assert.equal(verifySessionToken(adulterado), false);
  });

  test("token assinado com outro segredo é rejeitado", () => {
    const token = createSessionToken();
    process.env.BOOKING_ADMIN_SESSION_SECRET = "outro-segredo-completamente-diferente";
    assert.equal(verifySessionToken(token), false);
  });

  test("valores malformados nunca lançam exceção, só retornam false", () => {
    assert.equal(verifySessionToken(null), false);
    assert.equal(verifySessionToken(undefined), false);
    assert.equal(verifySessionToken(""), false);
    assert.equal(verifySessionToken("sem-ponto-nenhum"), false);
    assert.equal(verifySessionToken("a.b.c"), false);
    assert.equal(verifySessionToken(".semPayload"), false);
    assert.doesNotThrow(() => verifySessionToken({ objeto: true }));
  });

  test("nunca inclui a senha admin no token", () => {
    const token = createSessionToken();
    assert.ok(!token.includes("senha-super-secreta"));
  });
});
