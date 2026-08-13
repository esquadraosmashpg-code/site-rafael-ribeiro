// Conversões de fuso horário usando só o Intl nativo — sem biblioteca
// externa (o objetivo é evitar dependências pesadas para algo que o
// próprio runtime já resolve bem).

function offsetPartsAt(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return dtf.formatToParts(date).reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = Number(p.value);
    return acc;
  }, {});
}

// Quantos minutos `timeZone` está à frente (+) ou atrás (-) de UTC no
// instante `date`.
function tzOffsetMinutes(date, timeZone) {
  const p = offsetPartsAt(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUTC - date.getTime()) / 60000;
}

// Converte um horário "de parede" ({year, month, day, hour, minute}) no
// fuso `timeZone` para o instante UTC correspondente (objeto Date).
export function wallTimeToUTC({ year, month, day, hour, minute }, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60000);
}

// Retorna {year, month, day, hour, minute, second} representando "agora"
// (ou o instante `now` passado) no fuso `timeZone`.
export function nowPartsInTZ(timeZone, now = new Date()) {
  const p = offsetPartsAt(now, timeZone);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

// Dia da semana (0=domingo..6=sábado) de uma data de calendário
// {year, month, day}. Isso é aritmética de calendário pura — não depende
// de fuso horário (20/08/2026 é quinta-feira em qualquer lugar do mundo).
export function weekdayOf({ year, month, day }) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
