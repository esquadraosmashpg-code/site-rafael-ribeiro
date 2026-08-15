import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin/guard";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { rejectBooking, BookingStatus } from "@/lib/booking/bookingRepository";
import { isAllowedOrigin } from "@/lib/booking/httpGuards";
import { hashIP, isRateLimited } from "@/lib/booking/rateLimit";

export const runtime = "nodejs";

function getClientIP(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

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

// POST /api/admin/agendamentos/[id]/rejeitar
// Ação "Marcar pagamento não identificado" -- nunca cria nem apaga nada
// no Google Calendar (nada foi criado ainda nesse ponto do fluxo).
export async function POST(request, context) {
  if (!isAllowedOrigin(request)) {
    return jsonNoStore({ error: "Requisição não permitida." }, { status: 403 });
  }
  if (!hasValidAdminSession(request)) {
    return jsonNoStore({ error: "Não autenticado." }, { status: 401 });
  }

  const ipKey = hashIP(getClientIP(request));
  if (isRateLimited(`admin-rejeitar:${ipKey}`, { windowMs: 60_000, max: 20 })) {
    return jsonNoStore({ error: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente." }, { status: 429 });
  }

  if (!isSupabaseConfigured()) {
    return jsonNoStore({ error: "Sistema de reservas não configurado." }, { status: 503 });
  }

  const { id } = await context.params;
  if (typeof id !== "string" || !id) {
    return jsonNoStore({ error: "Identificador inválido." }, { status: 400 });
  }

  let booking;
  try {
    booking = await rejectBooking(id);
  } catch (err) {
    console.error("[admin-rejeitar] erro ao rejeitar reserva:", err.message);
    return jsonNoStore({ error: "Não foi possível marcar como não identificado agora." }, { status: 502 });
  }
  if (!booking) {
    return jsonNoStore({ error: "Reserva não encontrada." }, { status: 404 });
  }

  // reject_booking (na migration) só transiciona a partir de
  // PENDING_PAYMENT -- se a linha não estava mais nesse estado (ex.: já
  // virou CONFIRMING/CONFIRMED entretanto, porque outra ação
  // administrativa começou a confirmar essa mesma reserva primeiro), a
  // RPC devolve a linha SEM alterar nada. Nunca declara sucesso nesse
  // caso -- o botão "pagamento não identificado" não deveria mais
  // funcionar pra essa reserva, e a resposta precisa deixar isso claro
  // em vez de um `ok:true` genérico que sugeriria que a rejeição
  // realmente aconteceu.
  if (booking.status !== BookingStatus.PAYMENT_REJECTED) {
    return jsonNoStore(
      {
        error: `Essa reserva não pôde ser marcada como não identificada (status atual: ${booking.status}). Atualize a lista.`,
      },
      { status: 409 }
    );
  }

  return jsonNoStore({ ok: true, publicId: booking.public_code, status: booking.status });
}
