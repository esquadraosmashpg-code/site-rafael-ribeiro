import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateBookingPayload, sanitizeText, sanitizeWhatsapp } from "../lib/booking/validate.js";

describe("sanitizeText", () => {
  test("remove tags HTML", () => {
    assert.equal(sanitizeText("<script>alert(1)</script>Maria"), "alert(1)Maria");
  });

  test("corta no tamanho máximo", () => {
    assert.equal(sanitizeText("a".repeat(300), { maxLength: 10 }).length, 10);
  });

  test("remove caracteres de controle", () => {
    const withControl = "Maria" + String.fromCharCode(0) + "Silva";
    assert.equal(sanitizeText(withControl), "MariaSilva");
  });
});

describe("sanitizeWhatsapp", () => {
  test("mantém só dígitos", () => {
    assert.equal(sanitizeWhatsapp("(11) 91234-5678"), "11912345678");
  });
});

describe("validateBookingPayload", () => {
  const base = {
    nome: "Maria Silva",
    email: "maria@example.com",
    whatsapp: "11912345678",
    modalidade: "online",
    data: "2026-08-20",
    horario: "09:00",
    aceitePrivacidade: true,
    aceiteCondicoesComerciais: true,
  };

  test("payload completo e correto é válido", () => {
    const { valid, errors } = validateBookingPayload(base);
    assert.equal(valid, true);
    assert.deepEqual(errors, []);
  });

  test("rejeita sem aceite da política de privacidade", () => {
    const { valid, errors } = validateBookingPayload({ ...base, aceitePrivacidade: false });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("Privacidade")));
  });

  test("rejeita sem aceite das condições comerciais (sinal/remarcação)", () => {
    const { valid, errors, value } = validateBookingPayload({ ...base, aceiteCondicoesComerciais: false });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("condições de agendamento")));
    assert.equal(value.aceiteCondicoesComerciais, false);
  });

  test("aceite das condições comerciais só conta se for exatamente true", () => {
    const { valid } = validateBookingPayload({ ...base, aceiteCondicoesComerciais: "sim" });
    assert.equal(valid, false);
  });

  test("rejeita e-mail inválido", () => {
    const { valid, errors } = validateBookingPayload({ ...base, email: "não-é-email" });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("e-mail")));
  });

  test("rejeita modalidade fora do enum", () => {
    const { valid, value } = validateBookingPayload({ ...base, modalidade: "<script>" });
    assert.equal(valid, false);
    assert.equal(value.modalidade, null);
  });

  test("rejeita data em formato errado", () => {
    const { valid } = validateBookingPayload({ ...base, data: "20/08/2026" });
    assert.equal(valid, false);
  });

  test("rejeita payload vazio/malicioso sem quebrar", () => {
    const { valid, errors } = validateBookingPayload({ __proto__: { evil: true } });
    assert.equal(valid, false);
    assert.ok(errors.length > 0);
  });

  test("nunca propaga campos fora do whitelist (ex.: motivo clínico)", () => {
    const { value } = validateBookingPayload({ ...base, motivo: "ideação suicida", diagnostico: "x" });
    assert.equal(value.motivo, undefined);
    assert.equal(value.diagnostico, undefined);
  });
});
