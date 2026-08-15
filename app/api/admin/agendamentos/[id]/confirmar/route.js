import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin/guard";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  getBookingById,
  beginConfirmation,
  finalizeConfirmation,
  revertToPending,
  markUnknown,
  effectiveStatus,
  BookingStatus,
} from "@/lib/booking/bookingRepository";
import { getBusyRanges, createCalendarEvent } from "@/lib/google/calendarClient";
import { bookingConfig } from "@/config/booking";
import { analise } from "@/config/content";
import { isAllowedOrigin } from "@/lib/booking/httpGuards";
import { hashIP, isRateLimited } from "@/lib/booking/rateLimit";

export const runtime = "nodejs";

function jsonNoStore(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init.headers,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function getClientIP(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function summaryFor(nome) {
  const partes = String(nome || "").trim().split(/\s+/);
  const primeiroNome = partes[0] || "";
  const inicialSobrenome = partes.length > 1 ? `${partes[partes.length - 1][0].toUpperCase()}.` : "";
  return `${analise.nomeServico} — ${primeiroNome} ${inicialSobrenome}`.trim();
}

async function safeRevert(id) {
  try {
    await revertToPending(id);
  } catch (err) {
    console.error("[admin-confirmar] erro ao reverter status:", err.message);
  }
}

// POST /api/admin/agendamentos/[id]/confirmar
// Ação "Confirmar sinal recebido". Só aqui, e só depois dessa confirmação
// manual, um evento é criado no Google Calendar. Ver o passo a passo
// completo comentado inline abaixo -- cada etapa corresponde a um item da
// especificação de confirmação manual.
export async function POST(request, context) {
  // Valida a Origin ANTES de qualquer checagem de sessão -- defesa em
  // profundidade contra CSRF, complementar ao SameSite=Strict do cookie.
  if (!isAllowedOrigin(request)) {
    return jsonNoStore({ error: "Requisição não permitida." }, { status: 403 });
  }

  // (1) reverifica sessão administrativa.
  if (!hasValidAdminSession(request)) {
    return jsonNoStore({ error: "Não autenticado." }, { status: 401 });
  }

  const ipKey = hashIP(getClientIP(request));
  if (isRateLimited(`admin-confirmar:${ipKey}`, { windowMs: 60_000, max: 20 })) {
    return jsonNoStore({ error: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente." }, { status: 429 });
  }

  if (!isSupabaseConfigured()) {
    return jsonNoStore({ error: "Sistema de reservas não configurado." }, { status: 503 });
  }

  const { id } = await context.params;
  if (typeof id !== "string" || !id) {
    return jsonNoStore({ error: "Identificador inválido." }, { status: 400 });
  }

  // (2) busca a reserva.
  let booking;
  try {
    booking = await getBookingById(id);
  } catch (err) {
    console.error("[admin-confirmar] erro ao buscar reserva:", err.message);
    return jsonNoStore({ error: "Não foi possível carregar a reserva agora." }, { status: 502 });
  }
  if (!booking) {
    return jsonNoStore({ error: "Reserva não encontrada." }, { status: 404 });
  }

  // (10) repetir a ação numa reserva JÁ confirmada devolve o MESMO
  // resultado, sem criar outro evento.
  if (booking.status === BookingStatus.CONFIRMED) {
    return jsonNoStore({
      ok: true,
      publicId: booking.public_code,
      googleEventId: booking.google_event_id,
      meetLink: booking.google_meet_url,
    });
  }

  // (3) recusa se expirada/rejeitada/já em estado inválido pra confirmar.
  const status = effectiveStatus(booking);
  if (status !== BookingStatus.PENDING_PAYMENT) {
    return jsonNoStore(
      {
        error:
          status === BookingStatus.UNKNOWN
            ? "Essa reserva está em estado indefinido (falha ambígua anterior) -- verifique manualmente no Google Calendar antes de qualquer ação."
            : `Essa reserva não pode ser confirmada (status atual: ${status}).`,
      },
      { status: 409 }
    );
  }

  // (4) transição atômica PENDING_PAYMENT -> CONFIRMING. Se duas
  // confirmações chegarem ao mesmo tempo, só uma ganha `won: true` --
  // ver comentário da RPC begin_confirmation na migration.
  let transition;
  try {
    transition = await beginConfirmation(id);
  } catch (err) {
    console.error("[admin-confirmar] erro na transição de status:", err.message);
    return jsonNoStore({ error: "Não foi possível iniciar a confirmação agora." }, { status: 502 });
  }

  if (!transition.won) {
    const current = transition.booking;
    if (current?.status === BookingStatus.CONFIRMED) {
      return jsonNoStore({
        ok: true,
        publicId: current.public_code,
        googleEventId: current.google_event_id,
        meetLink: current.google_meet_url,
      });
    }
    return jsonNoStore(
      { error: "Essa reserva expirou ou já está sendo processada por outra ação. Atualize a lista." },
      { status: 409 }
    );
  }

  const confirming = transition.booking;
  const startsAt = new Date(confirming.starts_at);
  const endsAt = new Date(confirming.ends_at);

  // (5) reconsulta o Google Calendar imediatamente, antes de criar o evento.
  let busyRanges;
  try {
    busyRanges = await getBusyRanges({ timeMin: startsAt, timeMax: endsAt, timeZone: bookingConfig.timezone });
  } catch (err) {
    console.error("[admin-confirmar] erro ao revalidar disponibilidade:", err.message);
    await safeRevert(id);
    return jsonNoStore({ error: "Não foi possível confirmar agora. Tente novamente em instantes." }, { status: 502 });
  }

  // (6) se surgiu conflito externo, não cria o evento e informa o administrador.
  const conflita = busyRanges.some(
    (b) => startsAt.getTime() < b.end.getTime() && b.start.getTime() < endsAt.getTime()
  );
  if (conflita) {
    await safeRevert(id);
    return jsonNoStore(
      {
        error:
          "Um conflito surgiu nesse horário no Google Calendar desde a reserva. A reserva foi mantida como pendente -- verifique manualmente antes de confirmar.",
      },
      { status: 409 }
    );
  }

  // (7) cria o evento -- 1h30, Meet, convite pro paciente, sendUpdates=all,
  // nenhum dado clínico, código na descrição. Nenhuma informação
  // financeira (valor/sinal) é escrita no Google Calendar.
  // Campos operacionais só -- nunca motivo/sintoma/diagnóstico, e nunca
  // valor/sinal (informação financeira fica de fora do Google Calendar).
  const descriptionLines = [
    `Serviço: ${analise.nomeServico}`,
    `Modalidade: ${confirming.mode === "online" ? "Online" : "Presencial"}`,
    `Telefone: ${confirming.patient_phone}`,
    `E-mail: ${confirming.patient_email}`,
    `Identificador: ${confirming.public_code}`,
    `Origem: Site Rafael Ribeiro`,
  ];

  let calendarResult;
  try {
    calendarResult = await createCalendarEvent({
      summary: summaryFor(confirming.patient_name),
      description: descriptionLines.join("\n"),
      startUTC: startsAt,
      endUTC: endsAt,
      timeZone: bookingConfig.timezone,
      attendeeEmail: confirming.patient_email,
      withMeet: confirming.mode === "online",
      location: confirming.mode === "presencial" ? bookingConfig.presencial.endereco : undefined,
    });
  } catch (err) {
    // Escrita AMBÍGUA -- não sabemos se o Google criou o evento antes do
    // erro chegar aqui. Nunca repete cego: marca UNKNOWN pra revisão manual.
    console.error("[admin-confirmar] erro ao criar evento:", err.message);
    try {
      await markUnknown(id);
    } catch (err2) {
      console.error("[admin-confirmar] erro ao marcar UNKNOWN:", err2.message);
    }
    return jsonNoStore(
      {
        error:
          "Não foi possível confirmar o evento no Google Calendar. O status ficou indefinido -- verifique manualmente no Google Calendar antes de tentar de novo.",
      },
      { status: 502 }
    );
  }

  // (8) salva google_event_id/meet/confirmed_at e status CONFIRMED.
  let finalBooking;
  try {
    finalBooking = await finalizeConfirmation(id, calendarResult.eventId, calendarResult.meetLink);
  } catch (err) {
    // O evento JÁ foi criado no Google -- não é seguro reverter (criaria
    // risco de duplicar na próxima tentativa). Marca UNKNOWN pra revisão manual.
    console.error("[admin-confirmar] erro ao finalizar confirmação:", err.message);
    try {
      await markUnknown(id);
    } catch {
      // ignora -- já estamos no pior caminho, só não deixa a função quebrar
    }
    return jsonNoStore(
      { error: "O evento foi criado no Google Calendar, mas não foi possível salvar a confirmação. Verifique manualmente." },
      { status: 502 }
    );
  }

  // Nunca declara sucesso sem o estado REAL devolvido pela RPC ser
  // CONFIRMED -- finalize_confirmation só transiciona a partir de
  // CONFIRMING; se por qualquer motivo a linha não estava mais em
  // CONFIRMING nesse momento (ex.: um estado inesperado que nenhuma
  // outra ação deveria ter causado, já que reject_booking foi restrito a
  // só aceitar PENDING_PAYMENT -- ver migration), a RPC devolve a linha
  // SEM alterar nada, com o status antigo. O evento JÁ foi criado no
  // Google nesse ponto (calendarResult existe) -- então nunca é seguro
  // simplesmente reportar erro e seguir em frente: marca UNKNOWN pra
  // revisão manual, do mesmo jeito que os outros caminhos ambíguos.
  if (finalBooking.status !== BookingStatus.CONFIRMED) {
    console.error("[admin-confirmar] finalize_confirmation não retornou CONFIRMED, status atual:", finalBooking.status);
    try {
      await markUnknown(id);
    } catch {
      // ignora -- já estamos no pior caminho, só não deixa a função quebrar
    }
    return jsonNoStore(
      {
        error:
          "O evento foi criado no Google Calendar, mas a reserva não pôde ser confirmada no banco (estado inesperado). Verifique manualmente antes de qualquer nova ação.",
      },
      { status: 502 }
    );
  }

  // (9) sucesso.
  return jsonNoStore({
    ok: true,
    publicId: finalBooking.public_code,
    googleEventId: finalBooking.google_event_id,
    meetLink: finalBooking.google_meet_url,
  });
}
