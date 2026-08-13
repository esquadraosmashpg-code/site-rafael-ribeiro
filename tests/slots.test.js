import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateTheoreticalSlots, filterMinNotice, filterBusy } from "../lib/booking/slots.js";

const config = {
  timezone: "America/Sao_Paulo",
  durationMinutes: 60,
  bufferMinutes: 15,
  minNoticeHours: 12,
};

// Quinta-feira, 20/08/2026 (dia útil, sem relação com feriado nenhum).
const QUINTA = { year: 2026, month: 8, day: 20 };

describe("generateTheoreticalSlots", () => {
  test("gera o primeiro horário exatamente em dayStart", () => {
    const slots = generateTheoreticalSlots(QUINTA, { ...config, dayStart: "09:00", dayEnd: "18:00" });
    assert.equal(slots[0].label, "09:00");
  });

  test("respeita duração + intervalo entre slots consecutivos", () => {
    const slots = generateTheoreticalSlots(QUINTA, { ...config, dayStart: "09:00", dayEnd: "18:00" });
    // 60min de consulta + 15min de intervalo = 75min entre o início de um slot e o do próximo
    const diffMs = slots[1].startUTC.getTime() - slots[0].startUTC.getTime();
    assert.equal(diffMs, 75 * 60000);
    // a duração de cada slot em si é exatamente durationMinutes
    assert.equal(slots[0].endUTC.getTime() - slots[0].startUTC.getTime(), 60 * 60000);
  });

  test("não gera slot que ultrapasse dayEnd", () => {
    const slots = generateTheoreticalSlots(QUINTA, { ...config, dayStart: "09:00", dayEnd: "10:30" });
    // com 60min de duração, só cabe 1 slot (09:00–10:00); 10:15 já passaria de 10:30
    assert.equal(slots.length, 1);
    assert.equal(slots[0].label, "09:00");
  });

  test("janela exata (dayEnd - dayStart == duration) gera 1 slot só", () => {
    const slots = generateTheoreticalSlots(QUINTA, { ...config, dayStart: "09:00", dayEnd: "10:00" });
    assert.equal(slots.length, 1);
  });
});

describe("filterMinNotice", () => {
  test("remove slots antes da antecedência mínima", () => {
    const slots = generateTheoreticalSlots(QUINTA, { ...config, dayStart: "09:00", dayEnd: "18:00" });
    // "agora" = quinta 08:00 BRT -> com 12h de antecedência, só vale a partir das 20:00 do mesmo dia
    const now = new Date("2026-08-20T11:00:00Z"); // 08:00 em America/Sao_Paulo (UTC-3)
    const result = filterMinNotice(slots, now, config);
    assert.ok(result.every((s) => s.startUTC.getTime() >= now.getTime() + 12 * 3600000));
    assert.ok(result.length < slots.length);
  });

  test("com antecedência já satisfeita, mantém todos os slots do dia seguinte", () => {
    const slots = generateTheoreticalSlots(QUINTA, { ...config, dayStart: "09:00", dayEnd: "18:00" });
    const now = new Date("2026-08-18T11:00:00Z"); // 2 dias antes
    const result = filterMinNotice(slots, now, config);
    assert.equal(result.length, slots.length);
  });
});

describe("filterBusy", () => {
  test("remove slot que colide com intervalo ocupado", () => {
    const slots = generateTheoreticalSlots(QUINTA, { ...config, dayStart: "09:00", dayEnd: "11:00" });
    // slots teóricos: 09:00-10:00 e 10:15-11:15 (mas dayEnd=11:00 corta o segundo) -> só 09:00-10:00
    assert.equal(slots.length, 1);
    const busy = [{ start: slots[0].startUTC, end: slots[0].endUTC }];
    const result = filterBusy(slots, busy);
    assert.equal(result.length, 0);
  });

  test("mantém slot que não colide com nada", () => {
    const slots = generateTheoreticalSlots(QUINTA, { ...config, dayStart: "09:00", dayEnd: "18:00" });
    const busy = [
      { start: new Date("2099-01-01T00:00:00Z"), end: new Date("2099-01-01T01:00:00Z") },
    ];
    const result = filterBusy(slots, busy);
    assert.equal(result.length, slots.length);
  });

  test("overlap parcial também remove o slot (não precisa ser idêntico)", () => {
    const slots = generateTheoreticalSlots(QUINTA, { ...config, dayStart: "09:00", dayEnd: "10:00" });
    const slot = slots[0]; // 09:00-10:00
    const busy = [{ start: new Date(slot.startUTC.getTime() + 30 * 60000), end: new Date(slot.endUTC.getTime() + 30 * 60000) }];
    const result = filterBusy(slots, busy);
    assert.equal(result.length, 0);
  });
});
