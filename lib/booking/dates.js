import { nowPartsInTZ, weekdayOf } from "./timezone.js";
import { generateTheoreticalSlots, filterMinNotice } from "./slots.js";

// Aritmética de calendário (sem hora, sem fuso) — soma dias a uma data
// {year, month, day}. Usa UTC internamente só como truque de cálculo, o
// resultado é sempre uma data "de calendário" pura.
export function addDays(date, days) {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function toISO({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseISODate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

// Lista as datas (YYYY-MM-DD) elegíveis para agendamento dentro da janela
// [hoje, hoje + maxWindowDays), respeitando os dias da semana disponíveis
// e garantindo que sobre pelo menos 1 horário depois de aplicar a
// antecedência mínima (ex.: hoje pode ficar de fora se já for tarde
// demais pra qualquer horário restante do dia).
export function listAvailableDates(config, now = new Date()) {
  const todayParts = nowPartsInTZ(config.timezone, now);
  const today = { year: todayParts.year, month: todayParts.month, day: todayParts.day };

  const dates = [];
  for (let offset = 0; offset < config.maxWindowDays; offset++) {
    const candidate = addDays(today, offset);
    if (!config.availableWeekdays.includes(weekdayOf(candidate))) continue;

    const theoretical = generateTheoreticalSlots(candidate, config);
    const withNotice = filterMinNotice(theoretical, now, config);
    if (withNotice.length === 0) continue;

    dates.push(toISO(candidate));
  }
  return dates;
}
