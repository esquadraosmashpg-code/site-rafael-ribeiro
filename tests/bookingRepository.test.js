import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createBooking, effectiveStatus, BookingStatus } from "../lib/booking/bookingRepository.js";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

function pgErrorResponse(code, message, status = 400) {
  return new Response(JSON.stringify({ code, message }), { status });
}

const baseArgs = {
  idempotencyKey: "chave-1",
  requestSignature: "sig-1",
  mode: "online",
  bookingDate: "2026-08-20",
  bookingTime: "08:00",
  startsAt: "2026-08-20T11:00:00.000Z",
  endsAt: "2026-08-20T12:30:00.000Z",
  patientName: "Maria Silva",
  patientEmail: "maria@example.com",
  patientPhone: "11999998888",
  holdMinutes: 30,
};

describe("createBooking -- criação bem-sucedida", () => {
  test("devolve outcome 'created' com a linha da reserva", async () => {
    global.fetch = async () =>
      new Response(JSON.stringify([{ id: "uuid-1", public_code: "AGD-ABC12345", status: "PENDING_PAYMENT" }]), {
        status: 200,
      });
    const result = await createBooking(baseArgs);
    assert.equal(result.outcome, "created");
    assert.equal(result.booking.public_code, "AGD-ABC12345");
  });
});

describe("createBooking -- mapeamento de erros do Postgres", () => {
  test("P0001 (idempotency_conflict) -- nunca reaproveita nem sobrescreve", async () => {
    global.fetch = async () => pgErrorResponse("P0001", "idempotency_conflict");
    const result = await createBooking(baseArgs);
    assert.equal(result.outcome, "idempotency_conflict");
  });

  test("P0002 (slot_taken) -- horário já reservado por outra pessoa", async () => {
    global.fetch = async () => pgErrorResponse("P0002", "slot_taken");
    const result = await createBooking(baseArgs);
    assert.equal(result.outcome, "slot_taken");
  });

  test("P0003 (public_code_conflict) -- tenta de novo com outro código e eventualmente cria", async () => {
    let chamadas = 0;
    global.fetch = async () => {
      chamadas++;
      if (chamadas < 3) return pgErrorResponse("P0003", "public_code_conflict");
      return new Response(JSON.stringify([{ id: "uuid-2", public_code: "AGD-XXXXXXXX", status: "PENDING_PAYMENT" }]), {
        status: 200,
      });
    };
    const result = await createBooking(baseArgs);
    assert.equal(result.outcome, "created");
    assert.equal(chamadas, 3);
  });

  test("erro inesperado (500) propaga como exceção -- rota deve responder 502, não fingir sucesso", async () => {
    global.fetch = async () => new Response("erro interno", { status: 500 });
    await assert.rejects(() => createBooking(baseArgs));
  });
});

describe("effectiveStatus -- reservas vencidas tratadas como expiradas sem cron", () => {
  test("PENDING_PAYMENT com expires_at no passado vira EXPIRED na leitura", () => {
    const booking = { status: "PENDING_PAYMENT", expires_at: "2020-01-01T00:00:00.000Z" };
    assert.equal(effectiveStatus(booking, new Date("2026-01-01T00:00:00.000Z")), BookingStatus.EXPIRED);
  });

  test("PENDING_PAYMENT ainda dentro do prazo continua PENDING_PAYMENT", () => {
    const booking = { status: "PENDING_PAYMENT", expires_at: "2026-01-01T01:00:00.000Z" };
    assert.equal(effectiveStatus(booking, new Date("2026-01-01T00:00:00.000Z")), BookingStatus.PENDING_PAYMENT);
  });

  test("outros status (CONFIRMED/CONFIRMING/UNKNOWN/PAYMENT_REJECTED) nunca são reescritos pela leitura", () => {
    for (const status of ["CONFIRMED", "CONFIRMING", "UNKNOWN", "PAYMENT_REJECTED"]) {
      const booking = { status, expires_at: "2020-01-01T00:00:00.000Z" };
      assert.equal(effectiveStatus(booking, new Date()), status);
    }
  });
});
