import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { notifyProfessional, buildNotificationContent, NotificationReason } from "../lib/notifications/professionalNotification.js";

const originalEnv = { ...process.env };

function limparEnv() {
  delete process.env.PROFESSIONAL_NOTIFICATION_ENABLED;
  delete process.env.PROFESSIONAL_NOTIFICATION_EMAIL;
}

beforeEach(limparEnv);
afterEach(() => {
  process.env = { ...originalEnv };
});

const dadosBase = {
  nome: "Maria Silva",
  data: "2026-08-20",
  horario: "08:00",
  modalidade: "online",
  publicId: "AGD-TESTE01",
  eventLink: "https://calendar.google.com/event?eid=xyz",
};

// Espiona TODOS os métodos de console durante um teste e devolve quantas
// vezes cada um foi chamado -- usado pra provar que notifyProfessional
// nunca loga nada, em nenhum estado.
function espionarConsole() {
  const originais = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  const chamadas = [];
  for (const metodo of Object.keys(originais)) {
    console[metodo] = (...args) => {
      chamadas.push({ metodo, args });
    };
  }
  return {
    chamadas,
    restaurar() {
      Object.assign(console, originais);
    },
  };
}

describe("notifyProfessional -- estados (desativada por padrão)", () => {
  test("sem PROFESSIONAL_NOTIFICATION_ENABLED, retorna 'disabled' silenciosamente", async () => {
    const resultado = await notifyProfessional(dadosBase);
    assert.deepEqual(resultado, { sent: false, reason: "disabled" });
    assert.equal(resultado.reason, NotificationReason.DISABLED);
  });

  test("PROFESSIONAL_NOTIFICATION_ENABLED='false' (qualquer coisa != 'true') continua 'disabled'", async () => {
    process.env.PROFESSIONAL_NOTIFICATION_ENABLED = "false";
    process.env.PROFESSIONAL_NOTIFICATION_EMAIL = "rafael@example.com";
    const resultado = await notifyProfessional(dadosBase);
    assert.equal(resultado.reason, "disabled");
  });

  test("habilitada mas sem e-mail configurado: 'misconfigured', não quebra o agendamento", async () => {
    process.env.PROFESSIONAL_NOTIFICATION_ENABLED = "true";
    const resultado = await notifyProfessional(dadosBase);
    assert.equal(resultado.sent, false);
    assert.equal(resultado.reason, "misconfigured");
    assert.equal(resultado.reason, NotificationReason.MISCONFIGURED);
  });

  test("habilitada com e-mail inválido: 'misconfigured', não quebra o agendamento", async () => {
    process.env.PROFESSIONAL_NOTIFICATION_ENABLED = "true";
    process.env.PROFESSIONAL_NOTIFICATION_EMAIL = "não-é-um-email";
    const resultado = await notifyProfessional(dadosBase);
    assert.equal(resultado.reason, "misconfigured");
  });

  test("habilitada e com e-mail válido: 'pending-integration' -- não finge que enviou", async () => {
    process.env.PROFESSIONAL_NOTIFICATION_ENABLED = "true";
    process.env.PROFESSIONAL_NOTIFICATION_EMAIL = "rafael@example.com";
    const resultado = await notifyProfessional(dadosBase);
    assert.equal(resultado.sent, false);
    assert.equal(resultado.reason, "pending-integration");
    assert.equal(resultado.reason, NotificationReason.PENDING_INTEGRATION);
  });

  test("nunca lança exceção, mesmo com dados incompletos ou ausentes", async () => {
    process.env.PROFESSIONAL_NOTIFICATION_ENABLED = "true";
    process.env.PROFESSIONAL_NOTIFICATION_EMAIL = "rafael@example.com";
    await assert.doesNotReject(() => notifyProfessional({}));
    await assert.doesNotReject(() => notifyProfessional(undefined));
    await assert.doesNotReject(() => notifyProfessional(null));
  });
});

describe("notifyProfessional -- NUNCA loga nada (item 4 da auditoria)", () => {
  test("desativada: nenhuma chamada de console, em nenhum método", async () => {
    const espiao = espionarConsole();
    try {
      await notifyProfessional(dadosBase);
    } finally {
      espiao.restaurar();
    }
    assert.deepEqual(espiao.chamadas, []);
  });

  test("mal configurada (sem e-mail): nenhuma chamada de console", async () => {
    process.env.PROFESSIONAL_NOTIFICATION_ENABLED = "true";
    const espiao = espionarConsole();
    try {
      await notifyProfessional(dadosBase);
    } finally {
      espiao.restaurar();
    }
    assert.deepEqual(espiao.chamadas, []);
  });

  test("mal configurada (e-mail inválido): nenhuma chamada de console", async () => {
    process.env.PROFESSIONAL_NOTIFICATION_ENABLED = "true";
    process.env.PROFESSIONAL_NOTIFICATION_EMAIL = "invalido";
    const espiao = espionarConsole();
    try {
      await notifyProfessional(dadosBase);
    } finally {
      espiao.restaurar();
    }
    assert.deepEqual(espiao.chamadas, []);
  });

  test("habilitada e configurada (pending-integration): nenhuma chamada de console -- nem o assunto/nome/data/horário/código", async () => {
    process.env.PROFESSIONAL_NOTIFICATION_ENABLED = "true";
    process.env.PROFESSIONAL_NOTIFICATION_EMAIL = "rafael@example.com";
    const espiao = espionarConsole();
    try {
      await notifyProfessional(dadosBase);
    } finally {
      espiao.restaurar();
    }
    assert.deepEqual(espiao.chamadas, [], "notifyProfessional não deveria logar nada em nenhum cenário");
  });
});

describe("buildNotificationContent (função separada, não chamada por notifyProfessional hoje)", () => {
  test("abrevia o nome (primeiro nome + inicial do sobrenome)", () => {
    const { body } = buildNotificationContent(dadosBase);
    assert.match(body, /Paciente: Maria S\./);
    assert.ok(!body.includes("Silva"), "sobrenome completo não deveria aparecer, só a inicial");
  });

  test("contém só os campos permitidos: nome abreviado, data, horário, modalidade, código, link", () => {
    const { body } = buildNotificationContent(dadosBase);
    assert.match(body, /Data: 2026-08-20/);
    assert.match(body, /Horário: 08:00/);
    assert.match(body, /Modalidade: Online/);
    assert.match(body, /Código: AGD-TESTE01/);
    assert.match(body, /Evento: https:\/\/calendar\.google\.com/);
  });

  test("nunca inclui motivo, sintoma, triagem ou qualquer campo clínico", () => {
    const comCamposIndevidos = { ...dadosBase, motivo: "ideação suicida", triagem: "ansiedade severa" };
    const { body, subject } = buildNotificationContent(comCamposIndevidos);
    assert.ok(!body.toLowerCase().includes("ideação"));
    assert.ok(!body.toLowerCase().includes("ansiedade"));
    assert.ok(!subject.toLowerCase().includes("ideação"));
  });

  test("funciona sem link do evento (campo opcional)", () => {
    const { body } = buildNotificationContent({ ...dadosBase, eventLink: null });
    assert.ok(!body.includes("Evento:"));
  });
});
