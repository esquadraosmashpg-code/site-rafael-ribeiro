import { NextResponse } from "next/server";
import { bookingConfig, isPresencialDisponivel } from "@/config/booking";
import { analise } from "@/config/content";
import { generateTheoreticalSlots } from "@/lib/booking/slots";
import { parseISODate, isValidCalendarDate, listAvailableDates, formatDateBR } from "@/lib/booking/dates";
import { validateBookingPayload } from "@/lib/booking/validate";
import { buildRequestSignature } from "@/lib/booking/idempotency";
import { hashIP, isRateLimited } from "@/lib/booking/rateLimit";
import { getBusyRanges } from "@/lib/google/calendarClient";
import { isAllowedOrigin, hasJsonContentType, readBodyWithLimit } from "@/lib/booking/httpGuards";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createBooking } from "@/lib/booking/bookingRepository";
import { getHoldMinutes, getPixConfig, getWhatsappNumber } from "@/lib/booking/paymentConfig";
import { buildWhatsappReservaMessage, buildWhatsappUrl } from "@/lib/booking/whatsappMessage";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 5_000;
const IDEMPOTENCY_KEY_RE = /^[a-zA-Z0-9-]{8,80}$/;

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

// POST /api/agendar/reservar
// Cria uma reserva PROVISÓRIA (PENDING_PAYMENT) -- nenhum evento é criado
// no Google Calendar aqui. O horário fica bloqueado por
// BOOKING_HOLD_MINUTES (padrão 30min); a confirmação definitiva só
// acontece quando o Dr. Rafael validar o sinal em /admin/agendamentos.
// Header: Idempotency-Key (opcional, recomendado).
// Body: { modalidade, data, horario, nome, email, whatsapp,
//         aceitePrivacidade, aceiteCondicoesComerciais, website? }
export async function POST(request) {
  if (!isAllowedOrigin(request)) {
    return jsonNoStore({ error: "Requisição não permitida." }, { status: 403 });
  }
  if (!hasJsonContentType(request)) {
    return jsonNoStore({ error: "Content-Type inválido." }, { status: 415 });
  }

  const ipKey = hashIP(getClientIP(request));
  if (isRateLimited(`reservar:${ipKey}`)) {
    return jsonNoStore(
      { error: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  if (!isSupabaseConfigured()) {
    // Nunca finge que a reserva foi criada -- avisa de forma segura que a
    // configuração está pendente (cenário esperado em desenvolvimento
    // local sem variáveis reais).
    return jsonNoStore(
      { error: "O sistema de reservas ainda não está configurado neste ambiente." },
      { status: 503 }
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
    return jsonNoStore({ error: "Não foi possível concluir a reserva." }, { status: 400 });
  }

  const { valid, errors, value } = validateBookingPayload(payload);
  if (!valid) {
    return jsonNoStore({ error: errors[0] || "Dados inválidos.", errors }, { status: 400 });
  }

  if (value.modalidade === "presencial" && !isPresencialDisponivel(bookingConfig)) {
    return jsonNoStore(
      { error: "Atendimento presencial ainda não está disponível para agendamento online. Escolha online ou fale pelo WhatsApp." },
      { status: 409 }
    );
  }

  const date = parseISODate(value.data);
  if (!isValidCalendarDate(date)) {
    return jsonNoStore({ error: "Data inválida." }, { status: 400 });
  }

  const now = new Date();
  // Autoridade da antecedência mínima é sempre o servidor: a data
  // escolhida precisa estar entre as datas realmente elegíveis agora
  // (nunca hoje, sempre a partir de amanhã, pulando fim de semana).
  if (!listAvailableDates(bookingConfig, now).includes(value.data)) {
    return jsonNoStore({ error: "Essa data não está mais disponível para agendamento." }, { status: 409 });
  }

  const theoretical = generateTheoreticalSlots(date, bookingConfig);
  const targetSlot = theoretical.find((s) => s.label === value.horario);
  if (!targetSlot) {
    return jsonNoStore({ error: "Esse horário não é válido." }, { status: 400 });
  }

  // Checagem de disponibilidade no Google Calendar -- além da checagem
  // feita no Supabase (reservas provisórias/confirmadas), o horário
  // também não pode colidir com um evento já existente no calendário
  // (ex.: bloqueio manual do Rafael).
  try {
    const busyRanges = await getBusyRanges({
      timeMin: targetSlot.startUTC,
      timeMax: targetSlot.endUTC,
      timeZone: bookingConfig.timezone,
    });
    const conflita = busyRanges.some(
      (b) => targetSlot.startUTC.getTime() < b.end.getTime() && b.start.getTime() < targetSlot.endUTC.getTime()
    );
    if (conflita) {
      return jsonNoStore({ error: "Esse horário já está ocupado. Escolha outro." }, { status: 409 });
    }
  } catch (err) {
    console.error("[reservar] erro ao consultar Google Calendar:", err.message);
    return jsonNoStore({ error: "Não foi possível verificar a disponibilidade agora. Tente novamente em instantes." }, { status: 502 });
  }

  const idempotencyKeyHeader = request.headers.get("idempotency-key");
  const idempotencyKey =
    typeof idempotencyKeyHeader === "string" && IDEMPOTENCY_KEY_RE.test(idempotencyKeyHeader)
      ? idempotencyKeyHeader
      : null;
  const requestSignature = buildRequestSignature({
    modalidade: value.modalidade,
    data: value.data,
    horario: value.horario,
    email: value.email,
  });

  const holdMinutes = getHoldMinutes();

  let result;
  try {
    result = await createBooking({
      idempotencyKey,
      requestSignature,
      mode: value.modalidade,
      bookingDate: value.data,
      bookingTime: value.horario,
      startsAt: targetSlot.startUTC.toISOString(),
      endsAt: targetSlot.endUTC.toISOString(),
      patientName: value.nome,
      patientEmail: value.email,
      patientPhone: value.whatsapp,
      holdMinutes,
    });
  } catch (err) {
    // Nunca loga o payload (PII) -- só a mensagem técnica do erro.
    console.error("[reservar] erro ao criar reserva:", err.message);
    return jsonNoStore({ error: "Não foi possível concluir a reserva agora. Tente novamente em instantes." }, { status: 502 });
  }

  if (result.outcome === "idempotency_conflict") {
    return jsonNoStore(
      { error: "Essa reserva já foi usada para um pedido diferente. Recarregue a página e tente de novo." },
      { status: 409 }
    );
  }
  if (result.outcome === "slot_taken") {
    return jsonNoStore(
      { error: "Esse horário acabou de ser reservado por outra pessoa. Escolha outro." },
      { status: 409 }
    );
  }

  const booking = result.booking;
  const pix = getPixConfig();
  const whatsappNumber = getWhatsappNumber();
  const dataFormatada = formatDateBR(date);
  const mensagem = buildWhatsappReservaMessage({
    publicCode: booking.public_code,
    dataFormatada,
    horario: value.horario,
  });

  return jsonNoStore({
    publicId: booking.public_code,
    modalidade: booking.mode,
    data: value.data,
    dataFormatada,
    horario: value.horario,
    expiresAt: booking.expires_at,
    valorTotal: analise.valor,
    sinal: analise.sinal,
    saldo: analise.saldo,
    pix,
    whatsapp: {
      configured: Boolean(whatsappNumber),
      url: buildWhatsappUrl(whatsappNumber, mensagem),
    },
  });
}
