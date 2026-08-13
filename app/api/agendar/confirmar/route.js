import { NextResponse } from "next/server";
import { bookingConfig, isPresencialDisponivel } from "@/config/booking";
import { analise } from "@/config/content";
import { generateTheoreticalSlots, filterMinNotice, filterBusy } from "@/lib/booking/slots";
import { parseISODate, isValidCalendarDate } from "@/lib/booking/dates";
import { weekdayOf } from "@/lib/booking/timezone";
import { validateBookingPayload } from "@/lib/booking/validate";
import { generatePublicId } from "@/lib/booking/publicId";
import { hashIP, isRateLimited } from "@/lib/booking/rateLimit";
import { acquireLock, releaseLock } from "@/lib/booking/lock";
import { buildRequestSignature, reserveAttempt, IdempotencyStatus } from "@/lib/booking/idempotency";
import { getBusyRanges, createCalendarEvent } from "@/lib/google/calendarClient";
import { isAllowedOrigin, hasJsonContentType, readBodyWithLimit } from "@/lib/booking/httpGuards";
import { notifyProfessional } from "@/lib/notifications/professionalNotification";

export const runtime = "nodejs";

// Corpo maximo aceito, em bytes. Um payload legitimo (nome/email/whatsapp/
// data/horario/modalidade/aceite) fica bem abaixo disso -- qualquer coisa
// maior e tratada como abuso, nao como caso de uso real.
const MAX_BODY_BYTES = 5_000;

// Idempotency key vem do cliente no header `Idempotency-Key` (nunca na
// URL/querystring) -- so aceita um formato plausivel, nunca usa direto
// sem checar tamanho/formato.
const IDEMPOTENCY_KEY_RE = /^[a-zA-Z0-9-]{8,80}$/;

// Nunca cacheavel -- disponibilidade muda a cada reserva, e a resposta de
// confirmacao carrega dado da consulta.
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

function summaryFor(nome) {
  const partes = nome.trim().split(/\s+/);
  const primeiroNome = partes[0] || "";
  const inicialSobrenome = partes.length > 1 ? `${partes[partes.length - 1][0].toUpperCase()}.` : "";
  return `${analise.nomeServico} — ${primeiroNome} ${inicialSobrenome}`.trim();
}

// POST /api/agendar/confirmar
// Header: Idempotency-Key (opcional, mas recomendado -- ver lib/booking/idempotency.js)
// Body: { modalidade, data, horario, nome, email, whatsapp,
//         aceitePrivacidade, aceiteCondicoesComerciais, website? }
// `website` e um honeypot: campo escondido no formulario que humano nunca
// preenche. Bot generico que preenche todo input costuma cair nessa.
export async function POST(request) {
  if (!isAllowedOrigin(request)) {
    return jsonNoStore({ error: "Requisição não permitida." }, { status: 403 });
  }

  if (!hasJsonContentType(request)) {
    return jsonNoStore({ error: "Content-Type inválido." }, { status: 415 });
  }

  const ipKey = hashIP(getClientIP(request));
  if (isRateLimited(`confirmar:${ipKey}`)) {
    return jsonNoStore(
      { error: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  const rawBody = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    return jsonNoStore({ error: "Corpo da requisição excede o tamanho permitido." }, { status: 413 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonNoStore({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (payload?.website) {
    // Honeypot acionado -- resposta generica, sem entregar que foi
    // detectado como bot.
    return jsonNoStore({ error: "Não foi possível confirmar o agendamento." }, { status: 400 });
  }

  const { valid, errors, value } = validateBookingPayload(payload);
  if (!valid) {
    return jsonNoStore({ error: errors[0] || "Dados inválidos.", errors }, { status: 400 });
  }

  // Idempotência de verdade: reserva o direito de processar essa (chave,
  // pedido) antes de fazer qualquer trabalho. Ver estados e limitação de
  // instância única em lib/booking/idempotency.js.
  const idempotencyKeyHeader = request.headers.get("idempotency-key");
  const idempotencyKey =
    typeof idempotencyKeyHeader === "string" && IDEMPOTENCY_KEY_RE.test(idempotencyKeyHeader)
      ? idempotencyKeyHeader
      : null;
  const requestSignature = buildRequestSignature({
    modalidade: value.modalidade,
    data: value.data,
    horario: value.horario,
    email: value.email,
  });

  const attempt = await reserveAttempt(idempotencyKey, requestSignature);
  if (attempt.outcome === "conflict") {
    return jsonNoStore(
      { error: "Essa confirmação já foi usada para um pedido diferente. Recarregue a página e tente de novo." },
      { status: 409 }
    );
  }
  if (attempt.outcome === "succeeded") {
    return jsonNoStore(attempt.response);
  }
  if (attempt.outcome === "unknown") {
    return jsonNoStore(
      { error: "Não conseguimos confirmar se a tentativa anterior deu certo. Aguarde um instante antes de tentar de novo." },
      { status: 409 }
    );
  }
  // attempt.outcome === "proceed" -- obrigatório chamar attempt.finish(...)
  // em TODO caminho de saída daqui pra frente, senão a chave fica presa
  // em PROCESSING até expirar pelo TTL.
  const { finish } = attempt;

  // Atendimento presencial fica bloqueado enquanto o endereço configurado
  // for o placeholder -- nunca manda endereço falso pro paciente. Checagem
  // sempre no servidor, nunca só confiando que a UI escondeu a opção.
  // Nenhuma chamada ao Google aconteceu ainda -- falha segura.
  if (value.modalidade === "presencial" && !isPresencialDisponivel(bookingConfig)) {
    finish(IdempotencyStatus.FAILED_SAFE);
    return jsonNoStore(
      { error: "Atendimento presencial ainda não está disponível para agendamento online. Escolha online ou fale pelo WhatsApp." },
      { status: 409 }
    );
  }

  const date = parseISODate(value.data);
  // Nunca confia em new Date(y, m, d) sozinho pra validar -- normaliza
  // mes/dia fora do intervalo silenciosamente em vez de indicar erro
  // (ex.: mes 13 viraria janeiro do ano seguinte). O regex em
  // validateBookingPayload so garante o formato "\d{4}-\d{2}-\d{2}", nao
  // que os numeros formem uma data real.
  if (!isValidCalendarDate(date)) {
    finish(IdempotencyStatus.FAILED_SAFE);
    return jsonNoStore({ error: "Data inválida." }, { status: 400 });
  }
  if (!bookingConfig.availableWeekdays.includes(weekdayOf(date))) {
    finish(IdempotencyStatus.FAILED_SAFE);
    return jsonNoStore({ error: "Esse dia não está disponível para agendamento." }, { status: 409 });
  }

  const now = new Date();
  const theoretical = generateTheoreticalSlots(date, bookingConfig);
  const withNotice = filterMinNotice(theoretical, now, bookingConfig);
  // O horario tem que bater EXATAMENTE com um dos 4 horarios fixos
  // (config/booking.js#horariosFixos) -- nunca confiamos so no horario
  // que o frontend mandou.
  const targetSlot = withNotice.find((s) => s.label === value.horario);

  if (!targetSlot) {
    finish(IdempotencyStatus.FAILED_SAFE);
    return jsonNoStore({ error: "Esse horário não é mais válido. Escolha outro horário." }, { status: 409 });
  }

  const lockKey = `${value.data}_${value.horario}`;
  if (!acquireLock(lockKey)) {
    finish(IdempotencyStatus.FAILED_SAFE);
    return jsonNoStore(
      { error: "Esse horário já está sendo reservado por outra pessoa agora. Tente outro horário." },
      { status: 409 }
    );
  }

  try {
    // Segunda checagem de disponibilidade, imediatamente antes de criar o
    // evento -- ver limitacao de concorrencia documentada em
    // lib/booking/lock.js. Chamada de LEITURA (freeBusy) -- se falhar,
    // nenhum efeito colateral aconteceu, falha é segura.
    let busyRanges;
    try {
      busyRanges = await getBusyRanges({
        timeMin: targetSlot.startUTC,
        timeMax: targetSlot.endUTC,
        timeZone: bookingConfig.timezone,
      });
    } catch (err) {
      console.error("[confirmar] erro ao revalidar disponibilidade:", err.message);
      finish(IdempotencyStatus.FAILED_SAFE);
      return jsonNoStore({ error: "Não foi possível confirmar agora. Tente novamente em instantes." }, { status: 502 });
    }

    const aindaLivre = filterBusy([targetSlot], busyRanges).length === 1;
    if (!aindaLivre) {
      finish(IdempotencyStatus.FAILED_SAFE);
      return jsonNoStore(
        { error: "Esse horário acabou de ser reservado por outra pessoa. Escolha outro." },
        { status: 409 }
      );
    }

    const publicId = generatePublicId();
    const isOnline = value.modalidade === "online";

    // Titulo neutro, sem nada clinico. Descricao interna tambem so com
    // dado operacional -- nunca motivo/sintoma/diagnostico.
    const descriptionLines = [
      `Serviço: ${analise.nomeServico}`,
      `Modalidade: ${isOnline ? "Online" : "Presencial"}`,
      `Telefone: ${value.whatsapp}`,
      `E-mail: ${value.email}`,
      `Identificador: ${publicId}`,
      `Origem: Site Rafael Ribeiro`,
    ];

    let calendarResult;
    try {
      calendarResult = await createCalendarEvent({
        summary: summaryFor(value.nome),
        description: descriptionLines.join("\n"),
        startUTC: targetSlot.startUTC,
        endUTC: targetSlot.endUTC,
        timeZone: bookingConfig.timezone,
        attendeeEmail: value.email,
        withMeet: isOnline,
        location: isOnline ? undefined : bookingConfig.presencial.endereco,
      });
    } catch (err) {
      // Chamada de ESCRITA -- não temos como saber com certeza se o
      // Google criou o evento antes do erro chegar até aqui (ex.: timeout
      // de rede depois da escrita ter sido aceita do lado de lá). Nunca
      // repete cegamente: marca como UNKNOWN, não FAILED_SAFE.
      console.error("[confirmar] erro ao criar evento:", err.message);
      finish(IdempotencyStatus.UNKNOWN);
      return jsonNoStore(
        {
          error:
            "Não foi possível confirmar o agendamento agora. Aguarde um instante antes de tentar de novo -- não recarregue nem clique várias vezes seguidas.",
        },
        { status: 502 }
      );
    }

    const responseBody = {
      publicId,
      modalidade: value.modalidade,
      data: value.data,
      horario: value.horario,
      inicioISO: targetSlot.startUTC.toISOString(),
      fimISO: targetSlot.endUTC.toISOString(),
      meetLink: isOnline ? calendarResult.meetLink : null,
      enderecoPresencial: isOnline ? null : bookingConfig.presencial.endereco,
      instrucoesPresencial: isOnline ? null : bookingConfig.presencial.instrucoes,
    };

    // Registra o sucesso ANTES de qualquer coisa que possa falhar depois
    // (notificação) -- um retry com a mesma chave já encontra o evento
    // criado e não tenta criar outro.
    finish(IdempotencyStatus.SUCCEEDED, responseBody);

    // Notificação pro profissional -- best-effort, nunca pode afetar a
    // resposta pro paciente nem o evento já criado. Desativada por
    // padrão e nunca loga dado pessoal (ver
    // lib/notifications/professionalNotification.js).
    try {
      await notifyProfessional({
        nome: value.nome,
        data: value.data,
        horario: value.horario,
        modalidade: value.modalidade,
        publicId,
        eventLink: calendarResult.htmlLink || calendarResult.meetLink || null,
      });
    } catch {
      // notifyProfessional nunca deveria lançar (sempre retorna um
      // objeto) -- se ainda assim lançar, ignora silenciosamente: o
      // agendamento já foi confirmado e a resposta já foi decidida.
    }

    return jsonNoStore(responseBody);
  } finally {
    releaseLock(lockKey);
  }
}
