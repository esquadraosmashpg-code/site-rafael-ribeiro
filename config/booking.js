// Config central da Agenda Própria — trocar as regras aqui, não espalhar
// constantes pelo resto do código. Este arquivo NAO tem segredo nenhum
// (nada de client_id/secret/token aqui), pode ser importado tanto por
// componentes de servidor quanto de cliente ("use client"). Segredos reais
// (Pix, senha admin, chaves Supabase) ficam só em variáveis de ambiente,
// nunca aqui -- ver lib/booking/paymentConfig.js.
import { endereco } from "./location.js";

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

  // Regra comercial definitiva (substituiu a antiga antecedência mínima
  // contada em horas): o paciente nunca marca para o mesmo dia -- a primeira data
  // possível é sempre amanhã, pulando pro próximo dia útil se cair em
  // fim de semana. Ver lib/booking/dates.js#earliestBookableDate -- o
  // backend é sempre a autoridade dessa regra, nunca o relógio do
  // navegador do paciente.

  // Até quantos dias no futuro é possível marcar (janela de agenda aberta).
  maxWindowDays: 60,

  // Dias da semana disponíveis para atendimento (e para a análise).
  // 0 = domingo, 1 = segunda, ..., 6 = sábado (igual ao Date#getDay()).
  availableWeekdays: [1, 2, 3, 4, 5], // segunda a sexta

  // Confirmação SEMPRE manual: o horário fica reservado provisoriamente
  // (PENDING_PAYMENT) até o Dr. Rafael confirmar o recebimento do sinal
  // no painel /admin/agendamentos. Nenhum evento é criado no Google
  // Calendar antes dessa confirmação. Ver app/api/agendar/reservar e
  // app/api/admin/agendamentos/[id]/confirmar.
  confirmacaoAutomatica: false,

  // Valores da Análise inicial (também refletidos em config/content.js
  // para exibição em texto corrido -- os números aqui são a fonte usada
  // pelas rotas de servidor).
  valorTotalCentavos: 35000, // R$ 350,00
  sinalCentavos: 15000, // R$ 150,00
  saldoCentavos: 20000, // R$ 200,00

  // Dados do atendimento presencial. Endereço confirmado pelo Rafael --
  // liberação definitiva do atendimento presencial na agenda (ver
  // `isPresencialDisponivel` abaixo). Vem de config/location.js, a mesma
  // fonte usada no rodapé/FAQ do site -- nunca duplicado aqui.
  presencial: {
    endereco: endereco.textoCompleto,
    // TODO(pendente com o Rafael): instruções de acesso reais
    // (estacionamento, portaria, sala). Não bloqueia o agendamento
    // presencial -- só o endereço (`endereco` acima) é obrigatório pra
    // isso, ver `isPresencialDisponivel`.
    instrucoes:
      "[PLACEHOLDER] Instruções de acesso (estacionamento, portaria, sala) — substituir quando confirmado",
  },
};

// ID público do calendário mostrado a humanos (não é segredo, é só o nome
// do profissional/consultório usado em textos da UI).
export const bookingDisplay = {
  nomeProfissional: "Rafael Ribeiro",
};

const PLACEHOLDER_MARKER = "[PLACEHOLDER]";

// Rafael confirmou definitivamente (ver config/location.js): o paciente
// sempre pode escolher entre presencial e online. Esta função continua
// existindo como trava de segurança -- nunca oferece presencial se, por
// qualquer motivo futuro, `presencial.endereco` voltar a ficar vazio ou
// com o marcador de placeholder (mandar um endereço falso/vazio pro
// paciente seria pior do que simplesmente não oferecer a opção). Todo o
// resto do fluxo (StepModalidade, POST /api/agendar/reservar) checa
// APENAS esta função -- nunca lê `presencial.endereco` diretamente pra
// decidir se presencial está disponível.
export function isPresencialDisponivel(config = bookingConfig) {
  const enderecoPresencial = config.presencial.endereco;
  return Boolean(enderecoPresencial) && !enderecoPresencial.startsWith(PLACEHOLDER_MARKER);
}
