import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { containsRisk } from "../lib/chat/risk.js";

describe("containsRisk (protocolo de crise)", () => {
  test("detecta palavras de risco conhecidas", () => {
    assert.equal(containsRisk("eu quero me matar"), true);
    assert.equal(containsRisk("penso em suicidio"), true);
    assert.equal(containsRisk("não aguento mais viver assim"), true);
    assert.equal(containsRisk("quero acabar com tudo"), true);
  });

  test("é case-insensitive", () => {
    assert.equal(containsRisk("QUERO ME MATAR"), true);
  });

  test("não dispara para texto comum do pré-atendimento", () => {
    assert.equal(containsRisk("Maria Silva"), false);
    assert.equal(containsRisk("Tenho ansiedade há uns 6 meses"), false);
    assert.equal(containsRisk("Prefiro atendimento online"), false);
  });

  test("não quebra com entrada vazia/indefinida", () => {
    assert.equal(containsRisk(""), false);
    assert.equal(containsRisk(undefined), false);
  });
});
