import { wallTimeToUTC } from "./timezone.js";

function parseHHMM(hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return { hour, minute };
}

function formatLabel(dateUTC, timeZone) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(dateUTC);
}

// Gera os horários TEÓRICOS de um dia (sem checar conflito nenhum ainda),
// respeitando duração + intervalo dentro da janela [dayStart, dayEnd] do
// config. `date` = { year, month, day }.
// Retorna array de { startUTC: Date, endUTC: Date, label: "09:00" }.
export function generateTheoreticalSlots(date, config) {
  const start = parseHHMM(config.dayStart);
  const end = parseHHMM(config.dayEnd);

  const dayStartUTC = wallTimeToUTC({ ...date, ...start }, config.timezone);
  const dayEndUTC = wallTimeToUTC({ ...date, ...end }, config.timezone);

  const stepMs = (config.durationMinutes + config.bufferMinutes) * 60000;
  const durationMs = config.durationMinutes * 60000;

  const slots = [];
  let cursor = dayStartUTC.getTime();
  while (cursor + durationMs <= dayEndUTC.getTime()) {
    const startUTC = new Date(cursor);
    const endUTC = new Date(cursor + durationMs);
    slots.push({ startUTC, endUTC, label: formatLabel(startUTC, config.timezone) });
    cursor += stepMs;
  }
  return slots;
}

// Remove horários que não respeitam a antecedência mínima (config.minNoticeHours)
// em relação a `now`. Isso também remove, de quebra, qualquer horário no passado.
export function filterMinNotice(slots, now, config) {
  const cutoff = now.getTime() + config.minNoticeHours * 3600000;
  return slots.filter((s) => s.startUTC.getTime() >= cutoff);
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

// Remove horários que colidem com algum intervalo ocupado.
// busyRanges: array de { start: Date, end: Date }.
export function filterBusy(slots, busyRanges) {
  if (!busyRanges || busyRanges.length === 0) return slots;
  return slots.filter(
    (slot) => !busyRanges.some((busy) => rangesOverlap(slot.startUTC, slot.endUTC, busy.start, busy.end))
  );
}
