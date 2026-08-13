import { NextResponse } from "next/server";
import { bookingConfig } from "@/config/booking";
import { generateTheoreticalSlots, filterMinNotice, filterBusy } from "@/lib/booking/slots";
import { parseISODate, isValidCalendarDate } from "@/lib/booking/dates";
import { weekdayOf } from "@/lib/booking/timezone";
import { getBusyRanges } from "@/lib/google/calendarClient";

export const runtime = "nodejs";

// Nunca cacheavel -- disponibilidade muda a cada reserva feita.
function jsonNoStore(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...init.headers, "Cache-Control": "no-store" },
  });
}

// GET /api/agendar/disponibilidade?data=YYYY-MM-DD
// Retorna so os horarios LIVRES daquele dia. Nunca expoe os eventos nem
// os horarios ocupados em si -- so o que sobrou depois de filtrar.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dataParam = searchParams.get("data");

  if (!dataParam || !/^\d{4}-\d{2}-\d{2}$/.test(dataParam)) {
    return jsonNoStore({ error: "Parâmetro 'data' inválido." }, { status: 400 });
  }

  const date = parseISODate(dataParam);
  // Nunca confia em new Date(y, m, d) sozinho pra validar -- ele
  // normaliza mes/dia fora do intervalo em vez de indicar erro (ver
  // isValidCalendarDate em lib/booking/dates.js).
  if (!isValidCalendarDate(date)) {
    return jsonNoStore({ error: "Data inválida." }, { status: 400 });
  }

  if (!bookingConfig.availableWeekdays.includes(weekdayOf(date))) {
    return jsonNoStore({ date: dataParam, slots: [] });
  }

  const now = new Date();
  const theoretical = generateTheoreticalSlots(date, bookingConfig);
  const withNotice = filterMinNotice(theoretical, now, bookingConfig);

  if (withNotice.length === 0 || theoretical.length === 0) {
    return jsonNoStore({ date: dataParam, slots: [] });
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

  const free = filterBusy(withNotice, busyRanges);

  return jsonNoStore({
    date: dataParam,
    slots: free.map((s) => ({ horario: s.label })),
  });
}
