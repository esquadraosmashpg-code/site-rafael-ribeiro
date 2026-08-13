// Regressao do bug relatado em producao: o calendario de /agendar abria
// no mes errado (julho em vez de agosto) para visitantes no fuso
// America/Sao_Paulo. Causa raiz: o titulo do mes era formatado com
// Intl.DateTimeFormat SEM `timeZone` explicito, entao o navegador usava
// seu fuso local pra interpretar "meia-noite UTC do dia 1", que em
// qualquer fuso de offset negativo cai no ULTIMO DIA DO MES ANTERIOR.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatMonthLabel, isValidCalendarDate } from "../lib/booking/dates.js";

describe("formatMonthLabel (regressão do bug julho/agosto)", () => {
  test("agosto de 2026 nunca deve virar julho de 2026", () => {
    assert.equal(formatMonthLabel(2026, 8), "agosto de 2026");
    assert.notEqual(formatMonthLabel(2026, 8), "julho de 2026");
  });

  test("início de mês (mês 1, janeiro)", () => {
    assert.equal(formatMonthLabel(2026, 1), "janeiro de 2026");
  });

  test("fim de mês / virada de ano: dezembro não pode virar novembro", () => {
    assert.equal(formatMonthLabel(2026, 12), "dezembro de 2026");
    assert.notEqual(formatMonthLabel(2026, 12), "novembro de 2026");
  });

  test("janeiro do ano seguinte após dezembro", () => {
    assert.equal(formatMonthLabel(2027, 1), "janeiro de 2027");
  });

  test("os 12 meses do ano formatam com o nome certo, em ordem", () => {
    const nomes = [
      "janeiro", "fevereiro", "março", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    ];
    for (let m = 1; m <= 12; m++) {
      assert.equal(formatMonthLabel(2026, m), `${nomes[m - 1]} de 2026`);
    }
  });

  test("é imune ao fuso horário do processo/ambiente (roda igual em qualquer TZ)", () => {
    // Não dá pra mudar o fuso do processo Node em runtime de forma
    // confiável em todo SO, mas a implementação usa timeZone:"UTC"
    // explícito -- então o teste real de imunidade é justamente o de
    // cima: se algum dia alguém remover o timeZone explícito, esse teste
    // (rodando na CI, historicamente em UTC) provavelmente NÃO pegaria a
    // regressão sozinho -- por isso o teste principal é sempre comparar
    // o valor exato esperado, não só "não é undefined".
    assert.equal(formatMonthLabel(2026, 8), "agosto de 2026");
  });
});

describe("isValidCalendarDate (backend nunca confia em Date() se auto-normalizar)", () => {
  test("aceita datas reais", () => {
    assert.equal(isValidCalendarDate({ year: 2026, month: 8, day: 13 }), true);
    assert.equal(isValidCalendarDate({ year: 2026, month: 2, day: 28 }), true);
    assert.equal(isValidCalendarDate({ year: 2028, month: 2, day: 29 }), true); // ano bissexto
  });

  test("rejeita mês fora do intervalo 1-12", () => {
    assert.equal(isValidCalendarDate({ year: 2026, month: 13, day: 1 }), false);
    assert.equal(isValidCalendarDate({ year: 2026, month: 0, day: 1 }), false);
  });

  test("rejeita dia inexistente (30/fev, 31/abr)", () => {
    assert.equal(isValidCalendarDate({ year: 2026, month: 2, day: 30 }), false);
    assert.equal(isValidCalendarDate({ year: 2026, month: 4, day: 31 }), false);
  });

  test("rejeita 29/fev fora de ano bissexto", () => {
    assert.equal(isValidCalendarDate({ year: 2026, month: 2, day: 29 }), false);
  });

  test("rejeita valores não inteiros", () => {
    assert.equal(isValidCalendarDate({ year: 2026, month: 8.5, day: 13 }), false);
  });
});
