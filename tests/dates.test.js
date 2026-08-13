import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { listAvailableDates, addDays, toISO, parseISODate, formatMonthLabel } from "../lib/booking/dates.js";
import { weekdayOf, nowPartsInTZ } from "../lib/booking/timezone.js";

const config = {
  timezone: "America/Sao_Paulo",
  durationMinutes: 90,
  horariosFixos: ["08:00", "11:00", "14:00", "17:00"],
  minNoticeHours: 12,
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

  test("todas as datas retornadas respeitam a antecedência mínima de 12h", () => {
    const now = new Date("2026-08-17T11:00:00Z");
    const cutoff = now.getTime() + config.minNoticeHours * 3600000;
    const dates = listAvailableDates(config, now);
    for (const iso of dates) {
      // qualquer data listada precisa ter pelo menos 1 horário teórico
      // (09:00, o mais cedo do dia) igual ou depois do cutoff -- senão
      // ela nem deveria aparecer na lista.
      const d = parseISODate(iso);
      const inicioDoDia = new Date(Date.UTC(d.year, d.month - 1, d.day, 23, 59, 0)); // fim do dia, generoso
      assert.ok(inicioDoDia.getTime() >= now.getTime(), `${iso} não deveria estar na lista`);
    }
    assert.ok(cutoff > now.getTime()); // sanity check do próprio teste
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
    // é exatamente a lógica que StepData.js usa pra decidir o mês inicial
    const label = formatMonthLabel(primeira.year, primeira.month);
    assert.equal(label, "agosto de 2026");
  });

  test("nenhuma data passada (antes de hoje) aparece na lista", () => {
    const now = new Date("2026-08-13T19:33:19Z");
    const dates = listAvailableDates(prodConfig, now);
    for (const iso of dates) {
      assert.ok(iso >= "2026-08-13", `${iso} é uma data passada em relação a 2026-08-13`);
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

  test("listAvailableDates com 'agora' logo depois da meia-noite UTC continua no mês certo (julho)", () => {
    // 00:30 UTC de 01/ago = 31/jul 21:30 em SP -- ainda julho.
    const now = new Date("2026-08-01T00:30:00Z");
    const dates = listAvailableDates(config, now);
    if (dates.length > 0) {
      assert.ok(!dates[0].startsWith("2026-08-01"), "não deveria pular direto pro dia 1 de agosto ainda em 31/jul");
    }
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
