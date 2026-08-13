// Testa as pecas de seguranca puras usadas pelas rotas administrativas de
// OAuth (lib/security/*) diretamente. Nao importa as rotas em si
// (app/api/google/*/route.js) porque elas importam "next/server", que so
// resolve dentro do bundler do proprio Next -- fora dele (`node --test`
// puro), a resolucao ESM do Node falha mesmo com o pacote instalado
// (confirmado: `next build` compila essas rotas sem erro, entao a
// integracao real ja foi validada pelo build + pelo smoke test manual no
// servidor local; aqui testamos a logica de seguranca isolada).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { secureStateMatches } from "../lib/security/state.js";
import { escapeHtml } from "../lib/security/html.js";
import { GOOGLE_SCOPES, buildAuthUrl } from "../lib/google/oauth.js";

describe("secureStateMatches (comparação de tempo constante do state OAuth)", () => {
  test("aceita quando os dois states são idênticos", () => {
    const state = randomBytes(24).toString("hex");
    assert.equal(secureStateMatches(state, state), true);
  });

  test("rejeita quando os states divergem", () => {
    assert.equal(secureStateMatches("a".repeat(48), "b".repeat(48)), false);
  });

  test("rejeita quando um dos dois está ausente (sem state / sem cookie)", () => {
    assert.equal(secureStateMatches(null, "algumvalor"), false);
    assert.equal(secureStateMatches("algumvalor", undefined), false);
    assert.equal(secureStateMatches("", ""), false);
  });

  test("rejeita com tamanhos diferentes sem lançar exceção", () => {
    assert.doesNotThrow(() => secureStateMatches("curto", "muito-mais-longo-que-o-outro"));
    assert.equal(secureStateMatches("curto", "muito-mais-longo-que-o-outro"), false);
  });
});

describe("escapeHtml (evita XSS refletido no ?error= e no refresh_token exibido)", () => {
  test("escapa tags e aspas", () => {
    assert.equal(
      escapeHtml(`<img src=x onerror="alert(1)">`),
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  test("escapa aspas simples e &", () => {
    assert.equal(escapeHtml(`O'Brien & Cia`), "O&#39;Brien &amp; Cia");
  });

  test("não quebra com null/undefined", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
  });
});

describe("buildAuthUrl (parâmetros exigidos pela auditoria)", () => {
  const originalEnv = { ...process.env };

  test("inclui prompt=consent, access_type=offline e exatamente os 2 escopos", () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_REDIRECT_URI = "https://site-rafael-ribeiro.vercel.app/api/google/callback";

    const url = new URL(buildAuthUrl("state-de-teste"));

    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("prompt"), "consent");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("state"), "state-de-teste");
    assert.equal(url.searchParams.get("redirect_uri"), process.env.GOOGLE_REDIRECT_URI);

    const scopes = url.searchParams.get("scope").split(" ");
    assert.deepEqual(scopes.sort(), [...GOOGLE_SCOPES].sort());
    assert.deepEqual(
      [...GOOGLE_SCOPES].sort(),
      ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy"].sort()
    );

    process.env = originalEnv;
  });
});
