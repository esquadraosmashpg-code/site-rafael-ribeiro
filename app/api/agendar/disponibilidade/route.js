import { NextResponse } from "next/server";
import { bookingConfig } from "@/config/booking";
import { generateTheoreticalSlots, filterBusy } from "@/lib/booking/slots";
import { parseISODate, isValidCalendarDate, listAvailableDates } from "@/lib/booking/dates";
import { getBusyRanges } from "@/lib/google/calendarClient";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { listActiveStartsAtForDate } from "@/lib/booking/bookingRepository";

export const runtime = "nodejs";

// Nunca cacheavel -- disponibilidade muda a cada reserva feita.
function jsonNoStore(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...init.headers, "Cache-Control": "no-store" },
  });
}

// GET /api/agendar/disponibilidade?data=YYYY-MM-DD
// Retorna só os horários LIVRES daquele dia, considerando:
//   1) eventos ocupados no Google Calendar (freeBusy);
//   2) reservas provisórias (PENDING_PAYMENT) ainda dentro do prazo de
//      30 minutos no Supabase;
//   3) reservas em confirmação (CONFIRMING), confirmadas (CONFIRMED) ou em
//      estado ambíguo (UNKNOWN -- podem já ter criado evento no Google) no
//      Supabase.
// Reservas VENCIDAS (PENDING_PAYMENT com expires_at no passado) nunca
// bloqueiam -- a view `active_bookings` já filtra isso sem precisar de
// cron. Nunca expõe os eventos/reservas nem os horários ocupados em si --
// só o que sobrou depois de filtrar.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dataParam = searchParams.get("data");

  if (!dataParam || !/^\d{4}-\d{2}-\d{2}$/.test(dataParam)) {
    return jsonNoStore({ error: "Parâmetro 'data' inválido." }, { status: 400 });
  }

  const date = parseISODate(dataParam);
  if (!isValidCalendarDate(date)) {
    return jsonNoStore({ error: "Data inválida." }, { status: 400 });
  }

  // Autoridade da antecedência mínima é sempre o servidor: nunca hoje,
  // sempre a partir de amanhã, pulando fim de semana -- ver
  // lib/booking/dates.js#earliestBookableDate.
  if (!listAvailableDates(bookingConfig).includes(dataParam)) {
    return jsonNoStore({ date: dataParam, slots: [] });
  }

  const theoretical = generateTheoreticalSlots(date, bookingConfig);
  if (theoretical.length === 0) {
    return jsonNoStore({ date: dataParam, slots: [] });
  }

  // Falha FECHADA: sem o Supabase configurado, este servidor não tem
  // como saber se existe reserva provisória/confirmada bloqueando um
  // horário -- então nunca pode afirmar que esse horário está livre.
  // Responder um array de horários "livres" nessa situação seria
  // literalmente mostrar disponibilidade falsa (o paciente reservaria um
  // horário que a rota de criação, corretamente, vai recusar -- ou pior,
  // se algum dia a criação também falhar aberta, permitiria overbooking
  // real). Retorna erro em vez de uma lista otimista.
  if (!isSupabaseConfigured()) {
    return jsonNoStore(
      { error: "Sistema de reservas não configurado neste ambiente." },
      { status: 503 }
    );
  }

  let busyRanges = [];
  try {
    busyRanges = await getBusyRanges({
      timeMin: theoretical[0].startUTC,
      timeMax: theoretical[theoretical.length - 1].endUTC,
      timeZone: bookingConfig.timezone,
    });
  } catch (err) {
    console.error("[disponibilidade] erro ao consultar Google Calendar:", err.message);
    return jsonNoStore(
      { error: "Não foi possível consultar a disponibilidade agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }

  let afterGoogle = filterBusy(theoretical, busyRanges);

  // Supabase já confirmado configurado acima -- se a consulta em si
  // falhar (rede, timeout, projeto pausado etc.), cai no catch e falha
  // fechada (502), nunca devolve a lista filtrada só pelo Google.
  if (afterGoogle.length > 0) {
    try {
      const activeStartsAt = await listActiveStartsAtForDate(dataParam);
      const activeTimes = new Set(activeStartsAt.map((d) => d.getTime()));
      afterGoogle = afterGoogle.filter((s) => !activeTimes.has(s.startUTC.getTime()));
    } catch (err) {
      console.error("[disponibilidade] erro ao consultar reservas no Supabase:", err.message);
      return jsonNoStore(
        { error: "Não foi possível consultar a disponibilidade agora. Tente novamente em instantes." },
        { status: 502 }
      );
    }
  }

  return jsonNoStore({
    date: dataParam,
    slots: afterGoogle.map((s) => ({ horario: s.label })),
  });
}
