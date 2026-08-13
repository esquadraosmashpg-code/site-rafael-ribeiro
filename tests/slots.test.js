import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateTheoreticalSlots, filterMinNotice, filterBusy } from "../lib/booking/slots.js";

// Regras confirmadas pelo Rafael: 4 horários fixos (não derivados de
// duração+intervalo), 90 minutos cada.
const config = {
  timezone: "America/Sao_Paulo",
  durationMinutes: 90,
  horariosFixos: ["08:00", "11:00", "14:00", "17:00"],
  minNoticeHours: 12,
};

// Quinta-feira, 20/08/2026 (dia útil, sem relação com feriado nenhum).
const QUINTA = { year: 2026, month: 8, day: 20 };

describe("generateTheoreticalSlots (horários fixos confirmados)", () => {
  test("gera exatamente os 4 horários fixos, na ordem configurada", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    assert.deepEqual(
      slots.map((s) => s.label),
      ["08:00", "11:00", "14:00", "17:00"]
    );
  });

  test("cada horário dura exatamente 90 minutos", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    for (const slot of slots) {
      assert.equal(slot.endUTC.getTime() - slot.startUTC.getTime(), 90 * 60000);
    }
  });

  test("08:00 termina às 09:30", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    const slot0800 = slots.find((s) => s.label === "08:00");
    const fimLabel = new Intl.DateTimeFormat("pt-BR", {
      timeZone: config.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(slot0800.endUTC);
    assert.equal(fimLabel, "09:30");
  });

  test("17:00 termina às 18:30", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    const slot1700 = slots.find((s) => s.label === "17:00");
    const fimLabel = new Intl.DateTimeFormat("pt-BR", {
      timeZone: config.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(slot1700.endUTC);
    assert.equal(fimLabel, "18:30");
  });

  test("11:00 termina às 12:30 e 14:00 termina às 15:30", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    const fmt = (d) =>
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: config.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(d);
    assert.equal(fmt(slots.find((s) => s.label === "11:00").endUTC), "12:30");
    assert.equal(fmt(slots.find((s) => s.label === "14:00").endUTC), "15:30");
  });

  test("não inventa horário nenhum fora da lista configurada (nunca deriva por duração+intervalo)", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    const labelsPermitidos = new Set(["08:00", "11:00", "14:00", "17:00"]);
    for (const slot of slots) {
      assert.ok(labelsPermitidos.has(slot.label), `horário inesperado: ${slot.label}`);
    }
  });

  test("mudar horariosFixos no config muda os horários gerados (é lista explícita, não fórmula)", () => {
    const configAlternativo = { ...config, horariosFixos: ["09:00", "13:00"] };
    const slots = generateTheoreticalSlots(QUINTA, configAlternativo);
    assert.deepEqual(
      slots.map((s) => s.label),
      ["09:00", "13:00"]
    );
  });
});

describe("filterMinNotice", () => {
  test("remove slots antes da antecedência mínima", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    // "agora" = quinta 08:00 BRT -> com 12h de antecedência, só vale a partir das 20:00 do mesmo dia
    const now = new Date("2026-08-20T11:00:00Z"); // 08:00 em America/Sao_Paulo (UTC-3)
    const result = filterMinNotice(slots, now, config);
    assert.ok(result.every((s) => s.startUTC.getTime() >= now.getTime() + 12 * 3600000));
    assert.ok(result.length < slots.length);
  });

  test("com antecedência já satisfeita, mantém todos os 4 horários do dia seguinte", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    const now = new Date("2026-08-18T11:00:00Z"); // 2 dias antes
    const result = filterMinNotice(slots, now, config);
    assert.equal(result.length, slots.length);
    assert.equal(result.length, 4);
  });

  test("autoridade do backend: rejeita data inteiramente passada mesmo se o frontend mandar", () => {
    // Simula exatamente o cenário do bug relatado: o frontend, por algum
    // defeito, oferece/envia uma data do mês anterior (ex.: julho em vez
    // de agosto). O backend usa o PRÓPRIO relógio ("now" real, não o que
    // veio do cliente) e nunca deveria aceitar nada daquele dia.
    const dataPassada = { year: 2026, month: 7, day: 20 }; // mês inteiro no passado
    const slots = generateTheoreticalSlots(dataPassada, config);
    const now = new Date("2026-08-13T19:33:19Z"); // "agora" real do servidor, 13/08/2026
    const result = filterMinNotice(slots, now, config);
    assert.equal(result.length, 0, "nenhum horário de uma data passada deveria sobreviver à checagem do servidor");
  });
});

describe("filterBusy (conflito parcial no início, meio ou fim remove o horário inteiro)", () => {
  test("conflito que cobre o horário inteiro remove", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    const slot0800 = slots.find((s) => s.label === "08:00");
    const busy = [{ start: slot0800.startUTC, end: slot0800.endUTC }];
    const result = filterBusy(slots, busy);
    assert.ok(!result.some((s) => s.label === "08:00"));
    assert.equal(result.length, 3);
  });

  test("conflito só no INÍCIO dos 90 minutos já remove o horário", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    const slot1100 = slots.find((s) => s.label === "11:00");
    // evento ocupado começa 30min antes e termina 15min depois do início do slot
    const busy = [
      {
        start: new Date(slot1100.startUTC.getTime() - 30 * 60000),
        end: new Date(slot1100.startUTC.getTime() + 15 * 60000),
      },
    ];
    const result = filterBusy(slots, busy);
    assert.ok(!result.some((s) => s.label === "11:00"));
  });

  test("conflito só no FIM dos 90 minutos já remove o horário", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    const slot1400 = slots.find((s) => s.label === "14:00");
    // evento ocupado começa 15min antes do fim do slot e vai até depois
    const busy = [
      {
        start: new Date(slot1400.endUTC.getTime() - 15 * 60000),
        end: new Date(slot1400.endUTC.getTime() + 30 * 60000),
      },
    ];
    const result = filterBusy(slots, busy);
    assert.ok(!result.some((s) => s.label === "14:00"));
  });

  test("conflito no MEIO dos 90 minutos remove o horário", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    const slot1700 = slots.find((s) => s.label === "17:00");
    const meio = new Date((slot1700.startUTC.getTime() + slot1700.endUTC.getTime()) / 2);
    const busy = [{ start: new Date(meio.getTime() - 5 * 60000), end: new Date(meio.getTime() + 5 * 60000) }];
    const result = filterBusy(slots, busy);
    assert.ok(!result.some((s) => s.label === "17:00"));
  });

  test("evento fora dos 90 minutos (sem sobreposição real) não remove o horário", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    const busy = [
      { start: new Date("2099-01-01T00:00:00Z"), end: new Date("2099-01-01T01:00:00Z") },
    ];
    const result = filterBusy(slots, busy);
    assert.equal(result.length, slots.length);
  });

  test("conflito num horário não afeta os outros 3", () => {
    const slots = generateTheoreticalSlots(QUINTA, config);
    const slot1100 = slots.find((s) => s.label === "11:00");
    const busy = [{ start: slot1100.startUTC, end: slot1100.endUTC }];
    const result = filterBusy(slots, busy);
    assert.deepEqual(
      result.map((s) => s.label).sort(),
      ["08:00", "14:00", "17:00"]
    );
  });
});
