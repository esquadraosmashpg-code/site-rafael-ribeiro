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
// a partir da lista EXPLÍCITA de horários fixos em config.horariosFixos
// (ex.: ["08:00", "11:00", "14:00", "17:00"]) -- não deriva por
// duração+intervalo. Cada horário dura config.durationMinutes.
// `date` = { year, month, day }.
// Retorna array de { startUTC: Date, endUTC: Date, label: "08:00" }, na
// mesma ordem em que aparecem em horariosFixos.
export function generateTheoreticalSlots(date, config) {
  const durationMs = config.durationMinutes * 60000;

  return config.horariosFixos.map((horario) => {
    const { hour, minute } = parseHHMM(horario);
    const startUTC = wallTimeToUTC({ ...date, hour, minute }, config.timezone);
    const endUTC = new Date(startUTC.getTime() + durationMs);
    return { startUTC, endUTC, label: formatLabel(startUTC, config.timezone) };
  });
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

// Remove horários que colidem com algum intervalo ocupado -- qualquer
// sobreposição parcial (no início, no meio ou no fim dos 90 minutos)
// já é suficiente pra remover o horário inteiro.
// busyRanges: array de { start: Date, end: Date }.
export function filterBusy(slots, busyRanges) {
  if (!busyRanges || busyRanges.length === 0) return slots;
  return slots.filter(
    (slot) => !busyRanges.some((busy) => rangesOverlap(slot.startUTC, slot.endUTC, busy.start, busy.end))
  );
}
