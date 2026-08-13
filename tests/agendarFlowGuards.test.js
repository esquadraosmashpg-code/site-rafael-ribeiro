import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createSubmitGuard, createAttemptKeyStore, gerarIdempotencyKey } from "../lib/booking/submitGuard.js";

describe("createSubmitGuard (trava síncrona contra clique duplo)", () => {
  test("duas chamadas SÍNCRONAS e seguidas: só a primeira consegue a trava", () => {
    const guard = createSubmitGuard();
    const primeira = guard.tryAcquire();
    const segunda = guard.tryAcquire(); // sem nenhum await/render entre as duas
    assert.equal(primeira, true);
    assert.equal(segunda, false);
  });

  test("dispara duas 'confirmações' sem esperar novo render -- só uma chamada HTTP acontece", () => {
    // Simula exatamente o cenário pedido: dois cliques disparando a mesma
    // função confirmar(), de forma síncrona, sem esperar o React
    // re-renderizar entre um e outro.
    const guard = createSubmitGuard();
    let chamadasHTTP = 0;

    function confirmarSimulado() {
      if (!guard.tryAcquire()) return; // segundo clique é descartado aqui
      chamadasHTTP++; // representa o fetch("/api/agendar/confirmar", ...)
    }

    confirmarSimulado();
    confirmarSimulado();

    assert.equal(chamadasHTTP, 1);
  });

  test("libera em falha recuperável e permite tentar de novo", () => {
    const guard = createSubmitGuard();
    assert.equal(guard.tryAcquire(), true);
    guard.release(); // ex.: erro de validação, horário ocupado, erro de rede
    assert.equal(guard.tryAcquire(), true, "depois de liberar, uma nova tentativa deveria conseguir a trava");
  });

  test("NÃO libera depois de sucesso -- fica travada pra sempre nessa instância", () => {
    const guard = createSubmitGuard();
    assert.equal(guard.tryAcquire(), true);
    // sucesso: propositalmente não chama guard.release()
    assert.equal(guard.tryAcquire(), false, "depois de sucesso, novas tentativas deveriam continuar bloqueadas");
    assert.equal(guard.tryAcquire(), false);
  });

  test("isLocked reflete o estado atual", () => {
    const guard = createSubmitGuard();
    assert.equal(guard.isLocked, false);
    guard.tryAcquire();
    assert.equal(guard.isLocked, true);
    guard.release();
    assert.equal(guard.isLocked, false);
  });
});

describe("createAttemptKeyStore (chave de idempotência estável, sem useMemo)", () => {
  test("re-render (chamar keyFor de novo com a MESMA assinatura) não muda a chave", () => {
    const store = createAttemptKeyStore(gerarIdempotencyKey);
    const assinatura = "online|2026-08-20|08:00";
    const primeiraChamada = store.keyFor(assinatura);
    const segundaChamada = store.keyFor(assinatura); // simula um re-render
    const terceiraChamada = store.keyFor(assinatura); // e outro
    assert.equal(primeiraChamada, segundaChamada);
    assert.equal(segundaChamada, terceiraChamada);
  });

  test("falha recuperável reutiliza a chave (assinatura não mudou)", () => {
    const store = createAttemptKeyStore(gerarIdempotencyKey);
    const assinatura = "online|2026-08-20|08:00";
    const chaveAntesDaFalha = store.keyFor(assinatura);
    // simula uma tentativa que falhou de forma recuperável -- a pessoa
    // não mudou nada, só tenta de novo
    const chaveDepoisDoRetry = store.keyFor(assinatura);
    assert.equal(chaveAntesDaFalha, chaveDepoisDoRetry);
  });

  test("mudar modalidade, data OU horário gera uma chave NOVA", () => {
    const store = createAttemptKeyStore(gerarIdempotencyKey);
    const chave1 = store.keyFor("online|2026-08-20|08:00");
    const chave2 = store.keyFor("online|2026-08-20|11:00"); // só o horário mudou
    const chave3 = store.keyFor("presencial|2026-08-20|11:00"); // só a modalidade mudou
    const chave4 = store.keyFor("presencial|2026-08-21|11:00"); // só a data mudou
    assert.notEqual(chave1, chave2);
    assert.notEqual(chave2, chave3);
    assert.notEqual(chave3, chave4);
  });

  test("voltar pra uma seleção anterior gera OUTRA chave nova (não reaproveita a antiga)", () => {
    // Importante: não é um cache por assinatura, é "a chave da tentativa
    // atual". Se a pessoa mudar de horário e voltar pro original, é uma
    // tentativa NOVA, não a mesma de antes.
    const store = createAttemptKeyStore(gerarIdempotencyKey);
    const primeira = store.keyFor("online|2026-08-20|08:00");
    store.keyFor("online|2026-08-20|11:00");
    const terceira = store.keyFor("online|2026-08-20|08:00");
    assert.notEqual(primeira, terceira);
  });

  test("currentKey reflete a última chave gerada", () => {
    const store = createAttemptKeyStore(gerarIdempotencyKey);
    assert.equal(store.currentKey, null);
    const chave = store.keyFor("online|2026-08-20|08:00");
    assert.equal(store.currentKey, chave);
  });
});

describe("gerarIdempotencyKey", () => {
  test("gera valores diferentes a cada chamada", () => {
    const a = gerarIdempotencyKey();
    const b = gerarIdempotencyKey();
    assert.notEqual(a, b);
  });

  test("formato é compatível com a validação do servidor (letras, números, hífen, 8-80 chars)", () => {
    const chave = gerarIdempotencyKey();
    assert.match(chave, /^[a-zA-Z0-9-]{8,80}$/);
  });
});

describe("Uso combinado: trava + chave, simulando o fluxo real do AgendarFlow", () => {
  test("sucesso impede nova tentativa mesmo com a chave ainda 'válida'", () => {
    const guard = createSubmitGuard();
    const keyStore = createAttemptKeyStore(gerarIdempotencyKey);
    const assinatura = "online|2026-08-20|08:00";

    // primeira tentativa: sucesso
    assert.equal(guard.tryAcquire(), true);
    const chave = keyStore.keyFor(assinatura);
    // sucesso -- não libera o guard

    // segunda "clique" na mesma tela de sucesso (não deveria nem ser
    // possível na UI, mas a trava protege de qualquer forma)
    assert.equal(guard.tryAcquire(), false);
    assert.equal(keyStore.keyFor(assinatura), chave); // chave nem muda, já que a assinatura é a mesma
  });
});
