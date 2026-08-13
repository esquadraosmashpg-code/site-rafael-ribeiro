import { NextResponse } from "next/server";
import { bookingConfig, isPresencialDisponivel } from "@/config/booking";
import { generateTheoreticalSlots, filterMinNotice, filterBusy } from "@/lib/booking/slots";
import { parseISODate } from "@/lib/booking/dates";
import { weekdayOf } from "@/lib/booking/timezone";
import { validateBookingPayload } from "@/lib/booking/validate";
import { generatePublicId } from "@/lib/booking/publicId";
import { hashIP, isRateLimited } from "@/lib/booking/rateLimit";
import { acquireLock, releaseLock } from "@/lib/booking/lock";
import { getBusyRanges, createCalendarEvent } from "@/lib/google/calendarClient";
import { isAllowedOrigin, hasJsonContentType, readBodyWithLimit } from "@/lib/booking/httpGuards";

export const runtime = "nodejs";

// Corpo maximo aceito, em bytes. Um payload legitimo (nome/email/whatsapp/
// data/horario/modalidade/aceite) fica bem abaixo disso -- qualquer coisa
// maior e tratada como abuso, nao como caso de uso real.
const MAX_BODY_BYTES = 5_000;

// Nunca cacheavel -- disponibilidade muda a cada reserva, e a resposta de
// confirmacao carrega dado da consulta.
function jsonNoStore(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...init.headers, "Cache-Control": "no-store" },
  });
}

function getClientIP(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function summaryFor(nome) {
  const partes = nome.trim().split(/\s+/);
  const primeiroNome = partes[0] || "";
  const inicialSobrenome = partes.length > 1 ? `${partes[partes.length - 1][0].toUpperCase()}.` : "";
  return `Consulta — ${primeiroNome} ${inicialSobrenome}`.trim();
}

// POST /api/agendar/confirmar
// Body: { modalidade, data, horario, nome, email, whatsapp, aceitePrivacidade, website? }
// `website` e um honeypot: campo escondido no formulario que humano nunca
// preenche. Bot generico que preenche todo input costuma cair nessa.
export async function POST(request) {
  if (!isAllowedOrigin(request)) {
    return jsonNoStore({ error: "Requisição não permitida." }, { status: 403 });
  }

  if (!hasJsonContentType(request)) {
    return jsonNoStore({ error: "Content-Type inválido." }, { status: 415 });
  }

  const ipKey = hashIP(getClientIP(request));
  if (isRateLimited(`confirmar:${ipKey}`)) {
    return jsonNoStore(
      { error: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  const rawBody = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    return jsonNoStore({ error: "Corpo da requisição excede o tamanho permitido." }, { status: 413 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonNoStore({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (payload?.website) {
    // Honeypot acionado -- resposta generica, sem entregar que foi
    // detectado como bot.
    return jsonNoStore({ error: "Não foi possível confirmar o agendamento." }, { status: 400 });
  }

  const { valid, errors, value } = validateBookingPayload(payload);
  if (!valid) {
    return jsonNoStore({ error: errors[0] || "Dados inválidos.", errors }, { status: 400 });
  }

  // Atendimento presencial fica bloqueado enquanto o endereço configurado
  // for o placeholder -- nunca manda endereço falso pro paciente. Checagem
  // sempre no servidor, nunca só confiando que a UI escondeu a opção.
  if (value.modalidade === "presencial" && !isPresencialDisponivel(bookingConfig)) {
    return jsonNoStore(
      { error: "Atendimento presencial ainda não está disponível para agendamento online. Escolha online ou fale pelo WhatsApp." },
      { status: 409 }
    );
  }

  const date = parseISODate(value.data);
  if (!bookingConfig.availableWeekdays.includes(weekdayOf(date))) {
    return jsonNoStore({ error: "Esse dia não está disponível para agendamento." }, { status: 409 });
  }

  const now = new Date();
  const theoretical = generateTheoreticalSlots(date, bookingConfig);
  const withNotice = filterMinNotice(theoretical, now, bookingConfig);
  // O horario tem que bater EXATAMENTE com um slot gerado pelas regras --
  // nunca confiamos so no horario que o frontend mandou.
  const targetSlot = withNotice.find((s) => s.label === value.horario);

  if (!targetSlot) {
    return jsonNoStore({ error: "Esse horário não é mais válido. Escolha outro horário." }, { status: 409 });
  }

  const lockKey = `${value.data}_${value.horario}`;
  if (!acquireLock(lockKey)) {
    return jsonNoStore(
      { error: "Esse horário já está sendo reservado por outra pessoa agora. Tente outro horário." },
      { status: 409 }
    );
  }

  try {
    // Segunda checagem de disponibilidade, imediatamente antes de criar o
    // evento -- ver limitacao de concorrencia documentada em
    // lib/booking/lock.js.
    let busyRanges;
    try {
      busyRanges = await getBusyRanges({
        timeMin: targetSlot.startUTC,
        timeMax: targetSlot.endUTC,
        timeZone: bookingConfig.timezone,
      });
    } catch (err) {
      console.error("[confirmar] erro ao revalidar disponibilidade:", err.message);
      return jsonNoStore({ error: "Não foi possível confirmar agora. Tente novamente em instantes." }, { status: 502 });
    }

    const aindaLivre = filterBusy([targetSlot], busyRanges).length === 1;
    if (!aindaLivre) {
      return jsonNoStore(
        { error: "Esse horário acabou de ser reservado por outra pessoa. Escolha outro." },
        { status: 409 }
      );
    }

    const publicId = generatePublicId();
    const isOnline = value.modalidade === "online";

    // Titulo neutro, sem nada clinico. Descricao interna tambem so com
    // dado operacional -- nunca motivo/sintoma/diagnostico.
    const descriptionLines = [
      `Modalidade: ${isOnline ? "Online" : "Presencial"}`,
      `Telefone: ${value.whatsapp}`,
      `E-mail: ${value.email}`,
      `Identificador: ${publicId}`,
      `Origem: Site Rafael Ribeiro`,
    ];

    let calendarResult;
    try {
      calendarResult = await createCalendarEvent({
        summary: summaryFor(value.nome),
        description: descriptionLines.join("\n"),
        startUTC: targetSlot.startUTC,
        endUTC: targetSlot.endUTC,
        timeZone: bookingConfig.timezone,
        attendeeEmail: value.email,
        withMeet: isOnline,
        location: isOnline ? undefined : bookingConfig.presencial.endereco,
      });
    } catch (err) {
      console.error("[confirmar] erro ao criar evento:", err.message);
      return jsonNoStore(
        { error: "Não foi possível confirmar o agendamento agora. Tente novamente em instantes." },
        { status: 502 }
      );
    }

    return jsonNoStore({
      publicId,
      modalidade: value.modalidade,
      data: value.data,
      horario: value.horario,
      inicioISO: targetSlot.startUTC.toISOString(),
      fimISO: targetSlot.endUTC.toISOString(),
      meetLink: isOnline ? calendarResult.meetLink : null,
      enderecoPresencial: isOnline ? null : bookingConfig.presencial.endereco,
      instrucoesPresencial: isOnline ? null : bookingConfig.presencial.instrucoes,
    });
  } finally {
    releaseLock(lockKey);
  }
}
