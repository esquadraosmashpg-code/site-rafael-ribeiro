import { NextResponse } from "next/server";
import { getBookingByPublicCode, effectiveStatus, BookingStatus } from "@/lib/booking/bookingRepository";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { hashIP, isRateLimited } from "@/lib/booking/rateLimit";

export const runtime = "nodejs";

const CODE_RE = /^AGD-[A-Z0-9]{4,12}$/;

// Resposta ÚNICA pra "formato inválido" e "não encontrada" -- de
// propósito. Se as duas respostas fossem diferentes (400 vs 404, ou
// mensagens diferentes), alguém tentando enumerar códigos poderia usar
// essa diferença como oráculo pra saber se um código bem-formado existe
// sem ter acertado o código de verdade. A entropia do código em si
// (lib/booking/publicId.js: 8 caracteres aleatórios de um alfabeto de 32,
// gerados com crypto.randomBytes -- não sequencial, ~40 bits) já torna
// adivinhação inviável na prática; a resposta uniforme + rate limit
// abaixo são camadas adicionais.
const NOT_FOUND_RESPONSE = { error: "Reserva não encontrada." };

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

// GET /api/agendar/reserva/[codigo]/status
// Rota PÚBLICA (o paciente consulta o próprio código, sem autenticação --
// o código em si já funciona como "senha" de baixa sensibilidade, curto e
// aleatório). Nunca retorna nome/e-mail/telefone/UUID interno -- só o
// necessário pra tela de espera funcionar: código público, status, data,
// horário, prazo, e o link do Meet SÓ quando o status já é CONFIRMED
// (nunca antes disso, pra nunca sugerir confirmação que ainda não
// aconteceu).
export async function GET(request, context) {
  const ipKey = hashIP(getClientIP(request));
  // Limite moderado: a tela de reserva faz polling periódico (a cada
  // ~10s) do PRÓPRIO código durante os 30 minutos de espera -- o limite
  // precisa comportar isso com folga, mas ainda barrar varredura de
  // códigos.
  if (isRateLimited(`reserva-status:${ipKey}`, { windowMs: 60_000, max: 30 })) {
    return jsonNoStore({ error: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente." }, { status: 429 });
  }

  if (!isSupabaseConfigured()) {
    return jsonNoStore({ error: "Sistema de reservas não configurado." }, { status: 503 });
  }

  const { codigo } = await context.params;

  // Valida formato e tamanho ANTES de qualquer consulta ao banco --
  // nunca deixa um valor arbitrário (potencialmente longo, ou tentando
  // injeção via filtro do PostgREST) chegar até a query.
  if (typeof codigo !== "string" || codigo.length > 20 || !CODE_RE.test(codigo)) {
    return jsonNoStore(NOT_FOUND_RESPONSE, { status: 404 });
  }

  let booking;
  try {
    booking = await getBookingByPublicCode(codigo);
  } catch (err) {
    console.error("[reserva-status] erro ao consultar reserva:", err.message);
    return jsonNoStore({ error: "Não foi possível consultar a reserva agora. Tente novamente em instantes." }, { status: 502 });
  }

  if (!booking) {
    return jsonNoStore(NOT_FOUND_RESPONSE, { status: 404 });
  }

  const status = effectiveStatus(booking);

  return jsonNoStore({
    publicId: booking.public_code,
    status,
    data: booking.booking_date,
    horario: booking.booking_time,
    expiresAt: booking.expires_at,
    meetLink: status === BookingStatus.CONFIRMED ? booking.google_meet_url : null,
  });
}
