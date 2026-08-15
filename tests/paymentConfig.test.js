import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getHoldMinutes, getPixConfig, getWhatsappNumber } from "../lib/booking/paymentConfig.js";
import { buildWhatsappReservaMessage, buildWhatsappUrl } from "../lib/booking/whatsappMessage.js";

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.BOOKING_HOLD_MINUTES;
  delete process.env.BOOKING_PIX_KEY;
  delete process.env.BOOKING_PIX_RECEIVER;
  delete process.env.BOOKING_WHATSAPP_NUMBER;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("getHoldMinutes", () => {
  test("padrão é 30 quando a variável não está definida", () => {
    assert.equal(getHoldMinutes(), 30);
  });
  test("usa o valor configurado quando válido", () => {
    process.env.BOOKING_HOLD_MINUTES = "45";
    assert.equal(getHoldMinutes(), 45);
  });
  test("ignora valores inválidos (0, negativo, não-numérico) e cai no padrão", () => {
    process.env.BOOKING_HOLD_MINUTES = "0";
    assert.equal(getHoldMinutes(), 30);
    process.env.BOOKING_HOLD_MINUTES = "-5";
    assert.equal(getHoldMinutes(), 30);
    process.env.BOOKING_HOLD_MINUTES = "abc";
    assert.equal(getHoldMinutes(), 30);
  });
});

describe("getPixConfig -- nunca inventa uma chave falsa", () => {
  test("configured=false e key=null quando BOOKING_PIX_KEY não está definida", () => {
    const pix = getPixConfig();
    assert.equal(pix.configured, false);
    assert.equal(pix.key, null);
  });
  test("configured=true quando BOOKING_PIX_KEY está definida", () => {
    process.env.BOOKING_PIX_KEY = "chave@example.com";
    process.env.BOOKING_PIX_RECEIVER = "Rafael Ribeiro";
    const pix = getPixConfig();
    assert.equal(pix.configured, true);
    assert.equal(pix.key, "chave@example.com");
    assert.equal(pix.receiver, "Rafael Ribeiro");
  });
});

describe("getWhatsappNumber -- fonte central (config/content.js#site.whatsappNumero), não mais env var", () => {
  test("devolve exatamente site.whatsappNumero -- mesma fonte central usada por Footer/ChatWidget/fluxo de reserva", async () => {
    const { site } = await import("../config/content.js");
    assert.equal(getWhatsappNumber(), site.whatsappNumero);
  });

  test("o número configurado tem formato válido: só dígitos, começa com DDI 55", () => {
    const numero = getWhatsappNumber();
    assert.match(numero, /^55\d+$/);
  });

  test("BOOKING_WHATSAPP_NUMBER (variável de ambiente) não é mais lida -- deixou de ser a fonte", () => {
    process.env.BOOKING_WHATSAPP_NUMBER = "5511000000000";
    assert.notEqual(getWhatsappNumber(), "5511000000000");
  });
});

describe("buildWhatsappReservaMessage -- texto EXATO confirmado, sem dado clínico", () => {
  test("bate exatamente com o texto especificado", () => {
    const mensagem = buildWhatsappReservaMessage({
      publicCode: "AGD-ABC12345",
      dataFormatada: "20/08/2026",
      horario: "08:00",
    });
    const esperado =
      "Olá! Fiz a reserva da análise com o Dr. Rafael Ribeiro.\n" +
      "Código: AGD-ABC12345\n" +
      "Data: 20/08/2026\n" +
      "Horário: 08:00\n" +
      "Estou enviando o comprovante do sinal de R$ 150,00.";
    assert.equal(mensagem, esperado);
  });

  test("nunca afirma que o pagamento foi confirmado -- só que está sendo enviado", () => {
    const mensagem = buildWhatsappReservaMessage({ publicCode: "X", dataFormatada: "01/01/2026", horario: "08:00" });
    assert.ok(!/confirmad/i.test(mensagem));
  });

  test("nunca inclui dado clínico (motivo, sintoma, diagnóstico)", () => {
    const mensagem = buildWhatsappReservaMessage({ publicCode: "X", dataFormatada: "01/01/2026", horario: "08:00" });
    for (const termo of ["motivo", "sintoma", "diagnóstico", "ansiedade", "trauma"]) {
      assert.ok(!mensagem.toLowerCase().includes(termo));
    }
  });
});

describe("buildWhatsappUrl", () => {
  test("null quando número não configurado", () => {
    assert.equal(buildWhatsappUrl(null, "oi"), null);
  });
  test("monta a URL wa.me com a mensagem codificada", () => {
    const url = buildWhatsappUrl("5511999998888", "Olá!");
    assert.equal(url, "https://wa.me/5511999998888?text=Ol%C3%A1!");
  });
});
