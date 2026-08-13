import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { listAvailableDates, addDays, toISO, parseISODate } from "../lib/booking/dates.js";
import { weekdayOf } from "../lib/booking/timezone.js";

const config = {
  timezone: "America/Sao_Paulo",
  durationMinutes: 60,
  bufferMinutes: 15,
  minNoticeHours: 12,
  maxWindowDays: 14,
  availableWeekdays: [1, 2, 3, 4, 5],
  dayStart: "09:00",
  dayEnd: "18:00",
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

describe("listAvailableDates", () => {
  test("só lista dias úteis (segunda a sexta)", () => {
    const now = new Date("2026-08-17T11:00:00Z"); // segunda de manhã, antecedência já satisfeita
    const dates = listAvailableDates(config, now);
    for (const iso of dates) {
      const weekday = weekdayOf(parseISODate(iso));
      assert.ok(weekday >= 1 && weekday <= 5, `${iso} não é dia útil`);
    }
  });

  test("respeita a janela máxima (maxWindowDays)", () => {
    const now = new Date("2026-08-17T11:00:00Z");
    const dates = listAvailableDates(config, now);
    const last = parseISODate(dates[dates.length - 1]);
    const lastDate = new Date(Date.UTC(last.year, last.month - 1, last.day));
    const nowDate = new Date(Date.UTC(2026, 7, 17));
    const diffDays = (lastDate - nowDate) / 86400000;
    assert.ok(diffDays < config.maxWindowDays);
  });

  test("exclui o dia de hoje se já não sobra nenhum horário com a antecedência mínima", () => {
    // quinta às 17:50 BRT (quase fechando) -> nenhum slot de hoje tem 12h de antecedência
    const now = new Date("2026-08-20T20:50:00Z"); // 17:50 em America/Sao_Paulo
    const dates = listAvailableDates(config, now);
    assert.ok(!dates.includes("2026-08-20"));
  });
});
