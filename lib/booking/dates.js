import { nowPartsInTZ, weekdayOf } from "./timezone.js";

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

// Valida que {year, month, day} é uma data de calendário de verdade --
// NÃO confia em `new Date(y, m, d)` sozinho pra isso, porque o
// construtor do JS normaliza silenciosamente valores fora do intervalo
// (ex.: mês 13 vira janeiro do ano seguinte, dia 32 vira o 1º do mês
// seguinte) em vez de indicar erro. Construímos a data e conferimos se os
// campos UTC batem exatamente com o que foi pedido -- se o motor
// "corrigiu" pra outra data, os campos não vão bater.
export function isValidCalendarDate({ year, month, day }) {
  if (![year, month, day].every(Number.isInteger)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

// Formata o título de mês do calendário de agendamento (ex.: "agosto de
// 2026"). `year`/`month` seguem a mesma convenção 1-indexada do resto
// deste arquivo. Formata explicitamente em UTC -- formatar sem fixar
// timeZone deixaria o Intl.DateTimeFormat usar o fuso LOCAL do navegador,
// e pra qualquer fuso com offset negativo (ex.: America/Sao_Paulo,
// UTC-3), meia-noite UTC do dia 1 corresponde a ~21h do ÚLTIMO DIA DO MÊS
// ANTERIOR nesse fuso -- fazendo o título mostrar o mês errado. Foi
// exatamente esse o bug relatado em produção (calendário abria em julho
// em vez de agosto para visitantes no fuso de São Paulo).
export function formatMonthLabel(year, month, locale = "pt-BR") {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

// Regra comercial definitiva: o paciente NUNCA pode marcar para o mesmo
// dia -- a primeira data possível é sempre AMANHÃ, considerando o fuso do
// consultório (config.timezone = America/Sao_Paulo). Se amanhã cair num
// dia sem atendimento (config.availableWeekdays -- hoje, sábado/domingo),
// avança dia a dia até o próximo dia útil. O backend é a autoridade final
// dessa regra -- o frontend só reflete o que a API devolve, nunca decide
// sozinho "hoje" ou "amanhã" usando o relógio/fuso do navegador da pessoa.
export function earliestBookableDate(config, now = new Date()) {
  const todayParts = nowPartsInTZ(config.timezone, now);
  const today = { year: todayParts.year, month: todayParts.month, day: todayParts.day };

  let candidate = addDays(today, 1);
  // Proteção contra loop infinito caso availableWeekdays esteja mal
  // configurado (vazio) -- nunca deveria acontecer, mas falha rápido em
  // vez de travar.
  for (let guard = 0; guard < 14; guard++) {
    if (config.availableWeekdays.includes(weekdayOf(candidate))) return candidate;
    candidate = addDays(candidate, 1);
  }
  throw new Error("config.availableWeekdays não contém nenhum dia da semana válido.");
}

// Formata uma data de calendário pura (sem hora) no padrão brasileiro
// dd/mm/aaaa, ex.: "20/08/2026". Usada em textos exibidos ao paciente
// (tela de reserva, mensagem do WhatsApp) -- nunca em cálculo de fuso.
export function formatDateBR({ year, month, day }) {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).padStart(4, "0")}`;
}

// Lista as datas (YYYY-MM-DD) elegíveis para agendamento dentro da janela
// [earliestBookableDate, earliestBookableDate + maxWindowDays), respeitando
// os dias da semana disponíveis. Nunca inclui hoje, mesmo que sobrasse
// horário -- ver earliestBookableDate.
export function listAvailableDates(config, now = new Date()) {
  const start = earliestBookableDate(config, now);

  const dates = [];
  for (let offset = 0; offset < config.maxWindowDays; offset++) {
    const candidate = addDays(start, offset);
    if (!config.availableWeekdays.includes(weekdayOf(candidate))) continue;
    dates.push(toISO(candidate));
  }
  return dates;
}
