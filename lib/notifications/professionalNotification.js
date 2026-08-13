// Notificação por e-mail pro profissional quando um agendamento novo é
// confirmado. Arquitetura pronta, DESATIVADA por padrão -- só liga com
// PROFESSIONAL_NOTIFICATION_ENABLED=true nas variáveis de ambiente (não
// existe hoje nenhuma variável real cadastrada na Vercel, e este código
// não habilita nada sozinho).
//
// INTEGRAÇÃO PENDENTE, DE VERDADE: este projeto NÃO ENVIA NENHUM E-MAIL
// nesta versão. Não há provedor de e-mail configurado (ex.: Resend,
// Amazon SES, Postmark) e não existe serviço gratuito e confiável já
// disponível aqui pra plugar sem introduzir uma conta/serviço novo. Por
// isso esta função só valida a configuração e informa o motivo de não
// ter enviado -- nunca finge que enviou, e nunca loga dado pessoal em
// hipótese nenhuma (nem em caso de erro, nem "só pra debug"). O Google
// Calendar já mostra o evento direto pra conta organizadora, então a
// ausência desse e-mail não deixa o Rafael sem saber do agendamento -- é
// só uma notificação a mais, ainda não plugada. A ausência dela NUNCA
// afeta o agendamento em si (chamada sempre em try/catch no endpoint,
// depois do evento já criado).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Motivos possíveis de retorno -- nenhum deles nunca é lançado como
// exceção, e nenhum deles carrega dado pessoal.
export const NotificationReason = Object.freeze({
  DISABLED: "disabled",
  MISCONFIGURED: "misconfigured",
  PENDING_INTEGRATION: "pending-integration",
});

// Notifica o profissional sobre um agendamento confirmado. NUNCA lança
// exceção -- sempre retorna { sent, reason }. NUNCA chama console.log,
// console.warn, console.error ou qualquer outro log com nome, e-mail,
// telefone, data, horário, código de agendamento ou o payload da
// notificação -- nem quando ativada, nem quando desativada, nem em erro.
//
// `dados` só pode conter campos operacionais -- nunca motivo, sintoma,
// triagem ou qualquer informação clínica:
//   { nome, data, horario, modalidade, publicId, eventLink }
export async function notifyProfessional(_dados) {
  if (process.env.PROFESSIONAL_NOTIFICATION_ENABLED !== "true") {
    return { sent: false, reason: NotificationReason.DISABLED };
  }

  const email = process.env.PROFESSIONAL_NOTIFICATION_EMAIL;
  if (!email || !EMAIL_RE.test(email)) {
    return { sent: false, reason: NotificationReason.MISCONFIGURED };
  }

  // Chegou até aqui: notificação habilitada e com e-mail de destino
  // válido configurado -- mas ainda não existe transportador de e-mail
  // integrado (ver comentário no topo do arquivo). Não monta payload,
  // não loga nada, não envia nada. Quando um provedor real for plugado,
  // usar buildNotificationContent() (abaixo) pra montar o conteúdo
  // permitido e chamar o SDK/API do provedor aqui dentro.
  return { sent: false, reason: NotificationReason.PENDING_INTEGRATION };
}

function abreviarNome(nomeCompleto) {
  const partes = String(nomeCompleto || "").trim().split(/\s+/).filter(Boolean);
  const primeiro = partes[0] || "";
  const inicialSobrenome = partes.length > 1 ? `${partes[partes.length - 1][0].toUpperCase()}.` : "";
  return `${primeiro} ${inicialSobrenome}`.trim();
}

// Monta o conteúdo permitido da notificação (nome abreviado, data,
// horário, modalidade, código público, link do evento -- nunca dado
// clínico). Pura: não loga nada, não envia nada, só retorna o texto.
// Existe separada só pra já estar pronta pro dia em que um provedor de
// e-mail real for integrado -- notifyProfessional() acima NÃO chama essa
// função hoje (não tem por quê, já que nada é enviado ainda).
export function buildNotificationContent({ nome, data, horario, modalidade, publicId, eventLink }) {
  const linhas = [
    `Paciente: ${abreviarNome(nome)}`,
    `Data: ${data}`,
    `Horário: ${horario}`,
    `Modalidade: ${modalidade === "online" ? "Online" : "Presencial"}`,
    `Código: ${publicId}`,
    eventLink ? `Evento: ${eventLink}` : null,
  ].filter(Boolean);

  return {
    subject: `Novo agendamento — ${data} ${horario}`,
    body: linhas.join("\n"),
  };
}
