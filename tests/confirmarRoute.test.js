// Testa as guardas HTTP puras compartilhadas por todas as rotas de
// agendamento (hoje usadas em /api/agendar/reservar e nas rotas
// /api/admin/agendamentos/*) diretamente (Request nativo), sem importar
// nenhum route.js -- importar route.js exigiria "next/server", que só
// resolve dentro do bundler do Next (webpack/turbopack), não em
// `node --test` puro. Ver lib/booking/httpGuards.js.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin, hasJsonContentType, readBodyWithLimit } from "../lib/booking/httpGuards.js";
import { isPresencialDisponivel, bookingConfig } from "../config/booking.js";

const ORIGIN = "https://site-rafael-ribeiro.vercel.app";

describe("isAllowedOrigin", () => {
  test("aceita Origin igual ao host da requisição", () => {
    const req = new Request(`${ORIGIN}/api/agendar/confirmar`, { headers: { Origin: ORIGIN } });
    assert.equal(isAllowedOrigin(req), true);
  });

  test("rejeita Origin de outro domínio", () => {
    const req = new Request(`${ORIGIN}/api/agendar/confirmar`, { headers: { Origin: "https://evil.example" } });
    assert.equal(isAllowedOrigin(req), false);
  });

  test("aceita requisição sem header Origin", () => {
    const req = new Request(`${ORIGIN}/api/agendar/confirmar`);
    assert.equal(isAllowedOrigin(req), true);
  });
});

describe("hasJsonContentType", () => {
  test("aceita application/json", () => {
    const req = new Request(ORIGIN, { headers: { "Content-Type": "application/json" } });
    assert.equal(hasJsonContentType(req), true);
  });

  test("aceita com charset (application/json; charset=utf-8)", () => {
    const req = new Request(ORIGIN, { headers: { "Content-Type": "application/json; charset=utf-8" } });
    assert.equal(hasJsonContentType(req), true);
  });

  test("rejeita text/plain", () => {
    const req = new Request(ORIGIN, { headers: { "Content-Type": "text/plain" } });
    assert.equal(hasJsonContentType(req), false);
  });

  test("rejeita ausência de Content-Type", () => {
    const req = new Request(ORIGIN);
    assert.equal(hasJsonContentType(req), false);
  });
});

describe("readBodyWithLimit", () => {
  test("lê o corpo normalmente quando está dentro do limite", async () => {
    const body = JSON.stringify({ nome: "Maria" });
    const req = new Request(ORIGIN, { method: "POST", body });
    const result = await readBodyWithLimit(req, 1000);
    assert.equal(result, body);
  });

  test("recusa via Content-Length quando declarado maior que o limite", async () => {
    const req = new Request(ORIGIN, {
      method: "POST",
      headers: { "Content-Length": "999999" },
      body: "x",
    });
    const result = await readBodyWithLimit(req, 100);
    assert.equal(result, null);
  });

  test("corta de verdade durante a leitura mesmo sem Content-Length confiável", async () => {
    const hugeBody = "a".repeat(50_000);
    const req = new Request(ORIGIN, { method: "POST", body: hugeBody });
    const result = await readBodyWithLimit(req, 100);
    assert.equal(result, null);
  });
});

describe("isPresencialDisponivel (bloqueio do endereço placeholder)", () => {
  test("retorna false enquanto o endereço configurado for o placeholder padrão", () => {
    assert.equal(isPresencialDisponivel(bookingConfig), false);
  });

  test("retorna true assim que o endereço real for configurado", () => {
    const configComEndereco = {
      ...bookingConfig,
      presencial: { ...bookingConfig.presencial, endereco: "Rua Exemplo, 123 - São Paulo, SP" },
    };
    assert.equal(isPresencialDisponivel(configComEndereco), true);
  });
});
