const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Remove caracteres de controle (codigo < 32, ou 127/DEL) sem depender de
// escape \u dentro de regex — evita qualquer ambiguidade de codificacao.
function stripControlChars(value) {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code >= 32 && code !== 127) out += ch;
  }
  return out;
}

// Remove tags HTML e caracteres de controle, corta espaco nas pontas e
// limita o tamanho. Nao tenta permitir HTML "seguro" -- aqui e sempre
// texto puro.
export function sanitizeText(value, { maxLength = 200 } = {}) {
  if (typeof value !== "string") return "";
  const semTags = value.replace(/<[^>]*>/g, "");
  return stripControlChars(semTags).trim().slice(0, maxLength);
}

export function sanitizeWhatsapp(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.slice(0, 15);
}

// Valida (e sanitiza) o payload recebido em POST /api/agendar/confirmar.
// So valida os campos operacionais do agendamento -- nome, e-mail,
// WhatsApp, modalidade, data, horario e aceite. Nunca aceita/propaga
// campos clinicos aqui (motivo, sintomas etc. nao fazem parte da agenda).
export function validateBookingPayload(payload) {
  const errors = [];

  const nome = sanitizeText(payload?.nome, { maxLength: 120 });
  const email = sanitizeText(payload?.email, { maxLength: 160 }).toLowerCase();
  const whatsapp = sanitizeWhatsapp(payload?.whatsapp);
  const modalidade =
    payload?.modalidade === "online" || payload?.modalidade === "presencial" ? payload.modalidade : null;
  const data = typeof payload?.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.data) ? payload.data : null;
  const horario =
    typeof payload?.horario === "string" && /^\d{2}:\d{2}$/.test(payload.horario) ? payload.horario : null;
  const aceitePrivacidade = payload?.aceitePrivacidade === true;

  if (nome.length < 3 || !nome.includes(" ")) errors.push("Informe seu nome completo.");
  if (!EMAIL_RE.test(email)) errors.push("Informe um e-mail válido.");
  if (whatsapp.length < 10) errors.push("Informe um WhatsApp válido, com DDD.");
  if (!modalidade) errors.push("Selecione a modalidade de atendimento.");
  if (!data) errors.push("Selecione uma data válida.");
  if (!horario) errors.push("Selecione um horário válido.");
  if (!aceitePrivacidade) errors.push("É necessário aceitar a Política de Privacidade.");

  return {
    valid: errors.length === 0,
    errors,
    value: { nome, email, whatsapp, modalidade, data, horario, aceitePrivacidade },
  };
}
