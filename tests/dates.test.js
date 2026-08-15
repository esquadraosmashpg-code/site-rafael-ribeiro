import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  listAvailableDates,
  earliestBookableDate,
  addDays,
  toISO,
  parseISODate,
  formatMonthLabel,
  formatDateBR,
} from "../lib/booking/dates.js";
import { weekdayOf, nowPartsInTZ } from "../lib/booking/timezone.js";

const config = {
  timezone: "America/Sao_Paulo",
  horariosFixos: ["08:00", "11:00", "14:00", "17:00"],
  maxWindowDays: 14,
  availableWeekdays: [1, 2, 3, 4, 5],
};

describe("addDays / toISO / parseISODate", () => {
  test("soma dias corretamente atravessando mês", () => {
    const d = addDays({ year: 2026, month: 8, day: 30 }, 3);
    assert.deepEqual(d, { year: 2026, month: 9, day: 2 });
  });

  test("toISO/parseISODate são inversos", () => {
    const iso = toISO({ year: 2026, month: 1, day: 5 });
    assert.equal(iso, "2026-01-05");
    assert.deepEqual(parseISODate(iso), { year: 2026, month: 1, day: 5 });
  });
});

describe("formatDateBR", () => {
  test("formata no padrão dd/mm/aaaa", () => {
    assert.equal(formatDateBR({ year: 2026, month: 8, day: 5 }), "05/08/2026");
  });
});

describe("earliestBookableDate (regra comercial: nunca hoje, sempre amanhã, pula fim de semana)", () => {
  test("nunca retorna o próprio dia de hoje, mesmo de manhã cedo", () => {
    const now = new Date("2026-08-17T11:00:00Z"); // segunda de manhã em BRT
    const earliest = earliestBookableDate(config, now);
    assert.notDeepEqual(earliest, { year: 2026, month: 8, day: 17 });
  });

  test("segunda -> primeira data possível é terça (amanhã, dia útil)", () => {
    const now = new Date("2026-08-17T11:00:00Z"); // segunda 17/08/2026
    const earliest = earliestBookableDate(config, now);
    assert.deepEqual(earliest, { year: 2026, month: 8, day: 18 });
  });

  test("sexta -> primeira data possível é a próxima SEGUNDA (pula sábado e domingo)", () => {
    const now = new Date("2026-08-21T11:00:00Z"); // sexta 21/08/2026
    const earliest = earliestBookableDate(config, now);
    assert.deepEqual(earliest, { year: 2026, month: 8, day: 24 }); // segunda 24/08/2026
    assert.equal(weekdayOf(earliest), 1);
  });

  test("mesmo tarde da noite (perto da meia-noite), amanhã continua sendo amanhã, nunca hoje", () => {
    // 23h59 de quinta em BRT
    const now = new Date("2026-08-21T02:59:00Z"); // quinta 20/08 quase virando sexta em UTC, mas ainda quinta em BRT
    const parts = nowPartsInTZ(config.timezone, now);
    const earliest = earliestBookableDate(config, now);
    assert.notDeepEqual(earliest, { year: parts.year, month: parts.month, day: parts.day });
  });

  test("virada de mês: 31/08 (segunda) -> primeira data é 01/09 (terça)", () => {
    const now = new Date("2026-08-31T13:00:00Z"); // segunda 31/08/2026 em BRT
    const earliest = earliestBookableDate(config, now);
    assert.deepEqual(earliest, { year: 2026, month: 9, day: 1 });
  });

  test("virada de ano: 31/12/2026 (quinta) -> primeira data é 01/01/2027 (sexta)", () => {
    const now = new Date("2026-12-31T13:00:00Z"); // quinta 31/12/2026 em BRT
    const earliest = earliestBookableDate(config, now);
    assert.deepEqual(earliest, { year: 2027, month: 1, day: 1 });
  });
});

describe("listAvailableDates", () => {
  test("nunca inclui hoje", () => {
    const now = new Date("2026-08-17T11:00:00Z"); // segunda de manhã
    const dates = listAvailableDates(config, now);
    assert.ok(!dates.includes("2026-08-17"));
  });

  test("só lista dias úteis (segunda a sexta)", () => {
    const now = new Date("2026-08-17T11:00:00Z");
    const dates = listAvailableDates(config, now);
    for (const iso of dates) {
      const weekday = weekdayOf(parseISODate(iso));
      assert.ok(weekday >= 1 && weekday <= 5, `${iso} não é dia útil`);
    }
  });

  test("respeita a janela máxima (maxWindowDays), contada a partir da primeira data elegível", () => {
    const now = new Date("2026-08-17T11:00:00Z");
    const dates = listAvailableDates(config, now);
    const start = earliestBookableDate(config, now);
    const startDate = new Date(Date.UTC(start.year, start.month - 1, start.day));
    const last = parseISODate(dates[dates.length - 1]);
    const lastDate = new Date(Date.UTC(last.year, last.month - 1, last.day));
    const diffDays = (lastDate - startDate) / 86400000;
    assert.ok(diffDays < config.maxWindowDays);
  });

  test("a primeira data listada é sempre earliestBookableDate", () => {
    const now = new Date("2026-08-21T11:00:00Z"); // sexta
    const dates = listAvailableDates(config, now);
    const earliest = earliestBookableDate(config, now);
    assert.equal(dates[0], toISO(earliest));
  });
});

describe("Regressão de produção: 13/08/2026 em São Paulo deve abrir em Agosto de 2026", () => {
  const prodConfig = { ...config, maxWindowDays: 60 };

  test("nowPartsInTZ reporta agosto (mês 8), não julho (mês 7)", () => {
    // Instante exato observado em produção: 13/08/2026 16:33:19 BRT.
    const now = new Date("2026-08-13T19:33:19Z");
    const parts = nowPartsInTZ("America/Sao_Paulo", now);
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 8);
    assert.equal(parts.day, 13);
  });

  test("listAvailableDates começa em agosto de 2026, nunca em julho", () => {
    const now = new Date("2026-08-13T19:33:19Z");
    const dates = listAvailableDates(prodConfig, now);
    assert.ok(dates.length > 0);
    const primeira = parseISODate(dates[0]);
    assert.equal(primeira.year, 2026);
    assert.equal(primeira.month, 8, `primeira data deveria ser de agosto, veio mês ${primeira.month}`);
    assert.ok(!dates[0].startsWith("2026-07"), "nenhuma data de julho deveria aparecer na lista");
  });

  test("título do mês (o que StepData mostra) bate com o mês da primeira data disponível", () => {
    const now = new Date("2026-08-13T19:33:19Z");
    const dates = listAvailableDates(prodConfig, now);
    const primeira = parseISODate(dates[0]);
    const label = formatMonthLabel(primeira.year, primeira.month);
    assert.equal(label, "agosto de 2026");
  });

  test("nenhuma data passada (antes de hoje) aparece na lista", () => {
    const now = new Date("2026-08-13T19:33:19Z");
    const dates = listAvailableDates(prodConfig, now);
    for (const iso of dates) {
      assert.ok(iso > "2026-08-13", `${iso} deveria ser estritamente depois de 2026-08-13 (nunca hoje)`);
    }
  });
});

describe("Horário próximo da meia-noite em UTC (fuso negativo cruza o dia)", () => {
  test("00:30 UTC de 1º de agosto é ainda 31 de julho às 21:30 em São Paulo", () => {
    const now = new Date("2026-08-01T00:30:00Z");
    const parts = nowPartsInTZ("America/Sao_Paulo", now);
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 7);
    assert.equal(parts.day, 31);
  });

  test("03:00 UTC de 1º de agosto já é meia-noite em São Paulo (virou o dia)", () => {
    const now = new Date("2026-08-01T03:00:00Z");
    const parts = nowPartsInTZ("America/Sao_Paulo", now);
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 8);
    assert.equal(parts.day, 1);
  });

  test("earliestBookableDate calculado logo depois da meia-noite UTC continua ancorado em julho (31/jul em BRT)", () => {
    // 00:30 UTC de 01/ago = 31/jul 21:30 em SP -- "amanhã" a partir daí é 01/ago.
    const now = new Date("2026-08-01T00:30:00Z"); // sábado 01/ago em UTC, mas sexta 31/jul em BRT
    const earliest = earliestBookableDate(config, now);
    // sexta 31/jul -> amanhã seria sábado (não útil) -> pula pro dia útil seguinte
    assert.ok(!(earliest.year === 2026 && earliest.month === 7 && earliest.day === 31));
  });
});

describe("Virada de ano: dezembro de 2026 → janeiro de 2027", () => {
  test("addDays atravessa o fim do ano corretamente", () => {
    const d = addDays({ year: 2026, month: 12, day: 30 }, 3);
    assert.deepEqual(d, { year: 2027, month: 1, day: 2 });
  });

  test("listAvailableDates gera datas de janeiro/2027 com o ano certo quando a janela cruza o ano", () => {
    const now = new Date("2026-12-29T11:00:00Z"); // terça de manhã em BRT
    const dates = listAvailableDates({ ...config, maxWindowDays: 10 }, now);
    const temJaneiro2027 = dates.some((iso) => iso.startsWith("2027-01"));
    assert.ok(temJaneiro2027, "deveria ter pelo menos uma data de janeiro/2027 na janela");
    for (const iso of dates) {
      const d = parseISODate(iso);
      assert.ok(!(d.year === 2026 && d.month === 13), "nunca deveria gerar mês 13 do ano antigo");
    }
  });

  test("formatMonthLabel não confunde dezembro/2026 com dezembro/2027", () => {
    assert.equal(formatMonthLabel(2026, 12), "dezembro de 2026");
    assert.equal(formatMonthLabel(2027, 12), "dezembro de 2027");
  });
});
