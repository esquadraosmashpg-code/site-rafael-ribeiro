// Config central da Agenda Própria — trocar as regras aqui, não espalhar
// constantes pelo resto do código. Este arquivo NAO tem segredo nenhum
// (nada de client_id/secret/token aqui), pode ser importado tanto por
// componentes de servidor quanto de cliente ("use client").

export const bookingConfig = {
  // IANA timezone do consultório. Todo o agendamento (geração de horários,
  // antecedência mínima, janela máxima) é calculado neste fuso.
  timezone: "America/Sao_Paulo",

  // Duração da Análise Inicial, em minutos. Regra confirmada pelo Rafael:
  // 90 minutos exatos (ex.: 08:00 termina 09:30). NÃO é usada pra derivar
  // os horários do dia -- ver `horariosFixos` abaixo. Só define quanto
  // tempo cada horário fixo ocupa na agenda.
  durationMinutes: 90,

  // Horários fixos do dia, na ordem em que aparecem pro paciente.
  // Regra confirmada pelo Rafael -- NÃO são derivados de
  // duração+intervalo (o negócio funciona por horário fixo de verdade,
  // não por grade calculada): 08:00–09:30, 11:00–12:30, 14:00–15:30,
  // 17:00–18:30. Pra mudar os horários, edita essa lista direto.
  horariosFixos: ["08:00", "11:00", "14:00", "17:00"],

  // Quantas horas de antecedência mínima o paciente precisa dar antes do
  // horário da consulta (ex.: 12 = não deixa marcar para daqui a 3h).
  minNoticeHours: 12,

  // Até quantos dias no futuro é possível marcar (janela de agenda aberta).
  maxWindowDays: 60,

  // Dias da semana disponíveis para atendimento.
  // 0 = domingo, 1 = segunda, ..., 6 = sábado (igual ao Date#getDay()).
  availableWeekdays: [1, 2, 3, 4, 5], // segunda a sexta

  // Confirmação automática (sem aprovação manual do Dr. Rafael antes de
  // criar o evento). V1 = true. Se um dia precisar de aprovação manual,
  // muda pra false e ajusta o endpoint de confirmação.
  confirmacaoAutomatica: true,

  // Dados do atendimento presencial.
  presencial: {
    // TODO(SUBSTITUIR ANTES DE PUBLICAR): endereço real do consultório.
    endereco: "[PLACEHOLDER] Endereço do consultório — substituir antes de publicar",
    // TODO(SUBSTITUIR ANTES DE PUBLICAR): instruções reais (estacionamento, portaria, sala, etc.)
    instrucoes:
      "[PLACEHOLDER] Instruções de acesso (estacionamento, portaria, sala) — substituir antes de publicar",
  },
};

// ID público do calendário mostrado a humanos (não é segredo, é só o nome
// do profissional/consultório usado em textos da UI).
export const bookingDisplay = {
  nomeProfissional: "Rafael Ribeiro",
};

const PLACEHOLDER_MARKER = "[PLACEHOLDER]";

// Enquanto o endereço presencial continuar com o placeholder, o
// atendimento presencial fica bloqueado (na UI e, principalmente, no
// endpoint de confirmação -- nunca só na UI). É proposital: mandar um
// endereço falso pro paciente é pior do que simplesmente não oferecer a
// opção ainda. Some sozinho assim que alguém preencher o endereço real em
// bookingConfig.presencial.endereco.
export function isPresencialDisponivel(config = bookingConfig) {
  return !config.presencial.endereco.startsWith(PLACEHOLDER_MARKER);
}
