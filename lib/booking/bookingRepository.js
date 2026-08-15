// Camada de acesso às reservas no Supabase -- todo o resto do app (rotas
// de agendar/admin) fala com o banco só através destas funções, nunca
// direto com lib/supabase/client.js. Isso mantém num lugar só a tradução
// entre os códigos de erro do Postgres (levantados nas funções RPC da
// migration supabase/migrations/0001_create_bookings.sql) e os "outcomes"
// que o resto do código entende.
import { supabaseRpc, supabaseSelect } from "../supabase/client.js";
import { generatePublicId } from "./publicId.js";

export const BookingStatus = Object.freeze({
  PENDING_PAYMENT: "PENDING_PAYMENT",
  CONFIRMING: "CONFIRMING",
  CONFIRMED: "CONFIRMED",
  EXPIRED: "EXPIRED",
  PAYMENT_REJECTED: "PAYMENT_REJECTED",
  UNKNOWN: "UNKNOWN",
});

// Extrai o código de erro do Postgres (ex.: "P0001") do corpo de erro que
// o PostgREST devolve -- {"code":"P0001","message":"idempotency_conflict",...}.
function pgErrorCode(err) {
  if (!err?.body) return null;
  try {
    const parsed = JSON.parse(err.body);
    return parsed.code || null;
  } catch {
    return null;
  }
}

// As funções RPC devolvem um "record"/composite type -- o PostgREST às
// vezes serializa isso como array de 1 item, às vezes como objeto direto.
// Normaliza os dois formatos pra sempre devolver o objeto.
function firstRow(result) {
  return Array.isArray(result) ? result[0] : result;
}

// Cria a reserva provisória (PENDING_PAYMENT). Tenta de novo com um novo
// public_code só no caso extremamente raro de colisão de código (P0003) --
// nunca em caso de conflito de horário ou de idempotência.
export async function createBooking({
  idempotencyKey,
  requestSignature,
  mode,
  bookingDate,
  bookingTime,
  startsAt,
  endsAt,
  patientName,
  patientEmail,
  patientPhone,
  holdMinutes,
}) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const publicCode = generatePublicId();
    try {
      const result = await supabaseRpc("create_booking", {
        p_public_code: publicCode,
        p_idempotency_key: idempotencyKey,
        p_request_signature: requestSignature,
        p_mode: mode,
        p_booking_date: bookingDate,
        p_booking_time: bookingTime,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
        p_patient_name: patientName,
        p_patient_email: patientEmail,
        p_patient_phone: patientPhone,
        p_hold_minutes: holdMinutes,
      });
      return { outcome: "created", booking: firstRow(result) };
    } catch (err) {
      const code = pgErrorCode(err);
      if (code === "P0001") return { outcome: "idempotency_conflict" };
      if (code === "P0002") return { outcome: "slot_taken" };
      if (code === "P0003") {
        lastErr = err;
        continue; // colisão de código público -- tenta com outro
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function getBookingByPublicCode(publicCode) {
  const rows = await supabaseSelect(
    "bookings",
    `select=*&public_code=eq.${encodeURIComponent(publicCode)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function getBookingById(id) {
  const rows = await supabaseSelect("bookings", `select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows?.[0] || null;
}

// Horários ainda ativos (bloqueados) num dia -- usados pela rota de
// disponibilidade pra excluir, além do que o Google Calendar reporta como
// ocupado, os horários com reserva provisória/confirmada/ambígua no
// Supabase. Usa a view `active_bookings`, que já filtra a expiração sem
// precisar de cron.
export async function listActiveStartsAtForDate(bookingDateISO) {
  const rows = await supabaseSelect(
    "active_bookings",
    `select=starts_at&booking_date=eq.${encodeURIComponent(bookingDateISO)}`
  );
  return (rows || []).map((r) => new Date(r.starts_at));
}

// Transição PENDING_PAYMENT -> CONFIRMING. `won` indica se ESTA chamada
// foi quem fez a transição (ver comentário da RPC na migration).
export async function beginConfirmation(id) {
  const result = await supabaseRpc("begin_confirmation", { p_id: id });
  const row = firstRow(result);
  return { won: Boolean(row?.won), booking: row?.booking || null };
}

export async function finalizeConfirmation(id, googleEventId, googleMeetUrl) {
  const result = await supabaseRpc("finalize_confirmation", {
    p_id: id,
    p_google_event_id: googleEventId,
    p_google_meet_url: googleMeetUrl,
  });
  return firstRow(result);
}

export async function revertToPending(id) {
  const result = await supabaseRpc("revert_to_pending", { p_id: id });
  return firstRow(result);
}

export async function markUnknown(id) {
  const result = await supabaseRpc("mark_unknown", { p_id: id });
  return firstRow(result);
}

export async function rejectBooking(id) {
  const result = await supabaseRpc("reject_booking", { p_id: id });
  return firstRow(result);
}

// Listagem para o painel admin -- inclui PII (nome/e-mail/telefone), só
// pode ser chamada por rota protegida por sessão administrativa.
export async function listAdminBookings({ limit = 100 } = {}) {
  const rows = await supabaseSelect(
    "bookings",
    `select=*&status=neq.EXPIRED&order=created_at.desc&limit=${limit}`
  );
  return rows || [];
}

// Status efetivo pra exibição: uma linha PENDING_PAYMENT cujo expires_at
// já passou é tratada como expirada mesmo que a coluna `status` na tabela
// ainda diga PENDING_PAYMENT (não há cron que reescreva isso). Nunca
// confiar só na coluna crua pra decidir o que mostrar.
export function effectiveStatus(booking, now = new Date()) {
  if (booking.status === BookingStatus.PENDING_PAYMENT && new Date(booking.expires_at) <= now) {
    return BookingStatus.EXPIRED;
  }
  return booking.status;
}

// Espelho em JavaScript, PURO e testável, da definição EXATA de "essa
// reserva bloqueia o horário" usada em SQL (supabase/migrations/0001_
// create_bookings.sql, tanto na view `active_bookings` quanto dentro da
// função `create_booking`). As DUAS fontes -- esta função e o SQL --
// precisam expressar exatamente a mesma regra; a consistência textual
// entre elas é verificada em tests/auditCorrections.test.js. Não é usada
// diretamente pelas rotas (a decisão real acontece no Postgres, que é a
// autoridade), serve como referência única, documentada e testável de
// forma exaustiva pra essa regra de negócio.
//
// BLOQUEIA = (status === 'PENDING_PAYMENT' E expires_at > now)
//            OU status IN ('CONFIRMING', 'CONFIRMED', 'UNKNOWN')
// NÃO bloqueia = PENDING_PAYMENT vencida, EXPIRED, PAYMENT_REJECTED.
export function isBlockingStatus(status, expiresAt, now = new Date()) {
  if (status === BookingStatus.PENDING_PAYMENT) {
    return new Date(expiresAt).getTime() > now.getTime();
  }
  return status === BookingStatus.CONFIRMING || status === BookingStatus.CONFIRMED || status === BookingStatus.UNKNOWN;
}

// Espelho em JavaScript, PURO e testável, do critério usado pela RPC
// finalize_confirmation (ver supabase/migrations/0001_create_bookings.sql)
// pra aceitar um google_meet_url: precisa pertencer EXATAMENTE ao host
// HTTPS do Google Meet ("https://meet.google.com/..."), nunca outro
// domínio, nunca http://. Não é usada em nenhum caminho de produção (a
// decisão real e autoritativa acontece no Postgres, via `like
// 'https://meet.google.com/%'`) -- só documenta e permite testar
// exaustivamente a mesma regra sem precisar de um Postgres real.
const GOOGLE_MEET_PREFIX = "https://meet.google.com/";
export function isValidGoogleMeetUrl(url) {
  return typeof url === "string" && url.startsWith(GOOGLE_MEET_PREFIX) && url.length > GOOGLE_MEET_PREFIX.length;
}
