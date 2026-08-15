// Testes da auditoria corretiva (concorrência real, definição exata de
// bloqueio, falha fechada do Supabase, segurança das RPCs, anti-
// enumeração da rota pública, e CSRF nas rotas administrativas).
//
// A parte em SQL (migration) não pode ser executada de verdade aqui --
// não há Postgres neste ambiente de teste. O que ESTE arquivo prova:
//   1) a regra de bloqueio, testada exaustivamente como função pura em
//      JS (lib/booking/bookingRepository.js#isBlockingStatus), e
//      confirmada por checagem TEXTUAL de que o SQL usa exatamente a
//      mesma expressão booleana na view e na função de criação;
//   2) propriedades estruturais da migration (search_path, schema
//      qualificado, REVOKE/GRANT, chave de lock determinística, ordem
//      da re-checagem de idempotência) via leitura do arquivo-fonte;
//   3) comportamento fail-closed das rotas via leitura do código-fonte
//      (mesmo padrão já usado no restante da suíte pra rotas Next.js,
//      que não podem ser importadas fora do bundler -- ver
//      tests/oauthAdminRoutes.test.js).
// Isso é uma prova de CONSISTÊNCIA E ESTRUTURA, não um teste de
// integração contra um Postgres real -- ver README.md/relatório final
// para essa distinção.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isBlockingStatus, BookingStatus, isValidGoogleMeetUrl } from "../lib/booking/bookingRepository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function src(relPath) {
  return readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

const migration = src("supabase/migrations/0001_create_bookings.sql");
const disponibilidade = src("app/api/agendar/disponibilidade/route.js");
const reservar = src("app/api/agendar/reservar/route.js");
const status = src("app/api/agendar/reserva/[codigo]/status/route.js");
const adminConfirmar = src("app/api/admin/agendamentos/[id]/confirmar/route.js");
const adminRejeitar = src("app/api/admin/agendamentos/[id]/rejeitar/route.js");
const adminLogout = src("app/api/admin/agendamentos/logout/route.js");

// ---------------------------------------------------------------------
// 1) Definição exata de "isso bloqueia o horário" -- exaustiva
// ---------------------------------------------------------------------
describe("isBlockingStatus -- definição exata de bloqueio (espelho testável do SQL)", () => {
  const FUTURO = new Date("2026-01-01T13:00:00.000Z"); // ainda não venceu
  const PASSADO = new Date("2026-01-01T09:00:00.000Z"); // já venceu
  const AGORA = new Date("2026-01-01T12:00:00.000Z");

  test("PENDING_PAYMENT ativa (expires_at no futuro) BLOQUEIA", () => {
    assert.equal(isBlockingStatus("PENDING_PAYMENT", FUTURO, AGORA), true);
  });

  test("PENDING_PAYMENT vencida (expires_at no passado) NÃO bloqueia", () => {
    assert.equal(isBlockingStatus("PENDING_PAYMENT", PASSADO, AGORA), false);
  });

  test("PENDING_PAYMENT no limite exato (expires_at === now) NÃO bloqueia -- estritamente '>' , nunca '>='", () => {
    assert.equal(isBlockingStatus("PENDING_PAYMENT", AGORA, AGORA), false);
  });

  test("CONFIRMING bloqueia mesmo com expires_at (dos 30min originais) já vencido", () => {
    assert.equal(isBlockingStatus("CONFIRMING", PASSADO, AGORA), true);
  });

  test("CONFIRMED bloqueia mesmo com expires_at já vencido", () => {
    assert.equal(isBlockingStatus("CONFIRMED", PASSADO, AGORA), true);
  });

  test("UNKNOWN bloqueia mesmo com expires_at já vencido", () => {
    assert.equal(isBlockingStatus("UNKNOWN", PASSADO, AGORA), true);
  });

  test("EXPIRED nunca bloqueia, independente de expires_at", () => {
    assert.equal(isBlockingStatus("EXPIRED", FUTURO, AGORA), false);
    assert.equal(isBlockingStatus("EXPIRED", PASSADO, AGORA), false);
  });

  test("PAYMENT_REJECTED nunca bloqueia, independente de expires_at", () => {
    assert.equal(isBlockingStatus("PAYMENT_REJECTED", FUTURO, AGORA), false);
    assert.equal(isBlockingStatus("PAYMENT_REJECTED", PASSADO, AGORA), false);
  });

  test("tabela-verdade completa: todos os 6 estados x {futuro, passado}", () => {
    const esperado = {
      PENDING_PAYMENT: { futuro: true, passado: false },
      CONFIRMING: { futuro: true, passado: true },
      CONFIRMED: { futuro: true, passado: true },
      UNKNOWN: { futuro: true, passado: true },
      EXPIRED: { futuro: false, passado: false },
      PAYMENT_REJECTED: { futuro: false, passado: false },
    };
    for (const [statusValue, casos] of Object.entries(esperado)) {
      assert.equal(isBlockingStatus(statusValue, FUTURO, AGORA), casos.futuro, `${statusValue} + futuro`);
      assert.equal(isBlockingStatus(statusValue, PASSADO, AGORA), casos.passado, `${statusValue} + passado`);
    }
    assert.deepEqual(Object.keys(esperado).sort(), Object.values(BookingStatus).sort());
  });
});

describe("SQL usa a MESMA expressão de bloqueio na view e na função de criação", () => {
  test("as duas cláusulas centrais (PENDING_PAYMENT+expires_at, e o IN dos 3 estados) aparecem pelo menos 2x cada", () => {
    const ocorrenciasPending = (migration.match(/status = 'PENDING_PAYMENT' and expires_at > now\(\)/g) || []).length;
    const ocorrenciasIn = (migration.match(/status in \('CONFIRMING', 'CONFIRMED', 'UNKNOWN'\)/g) || []).length;
    assert.ok(ocorrenciasPending >= 2, `esperava a cláusula PENDING_PAYMENT repetida na view e na função, achou ${ocorrenciasPending}`);
    assert.ok(ocorrenciasIn >= 2, `esperava a cláusula IN repetida na view e na função, achou ${ocorrenciasIn}`);
  });

  test("view active_bookings usa a expressão", () => {
    const viewStart = migration.indexOf("create or replace view public.active_bookings");
    const viewEnd = migration.indexOf(";", viewStart);
    const viewBody = migration.slice(viewStart, viewEnd);
    assert.match(viewBody, /status = 'PENDING_PAYMENT' and expires_at > now\(\)/);
    assert.match(viewBody, /status in \('CONFIRMING', 'CONFIRMED', 'UNKNOWN'\)/);
  });

  test("create_booking usa a expressão no exists-check de slot_taken", () => {
    const fnStart = migration.indexOf("create or replace function public.create_booking");
    const fnEnd = migration.indexOf("$$;", fnStart);
    const fnBody = migration.slice(fnStart, fnEnd);
    assert.match(fnBody, /status = 'PENDING_PAYMENT' and expires_at > now\(\)/);
    assert.match(fnBody, /status in \('CONFIRMING', 'CONFIRMED', 'UNKNOWN'\)/);
    assert.match(fnBody, /raise exception 'slot_taken'/);
  });
});

// ---------------------------------------------------------------------
// 2) begin_confirmation: expiração checada atomicamente no WHERE
// ---------------------------------------------------------------------
describe("begin_confirmation -- expiração checada atomicamente, segurança não depende de UPDATE cosmético", () => {
  const fnStart = migration.indexOf("create or replace function public.begin_confirmation");
  const fnEnd = migration.indexOf("create or replace function public.finalize_confirmation");
  const fnBody = migration.slice(fnStart, fnEnd);

  test("o UPDATE que faz a transição real exige status=PENDING_PAYMENT E expires_at>now() no mesmo WHERE", () => {
    const updateIdx = fnBody.indexOf("set status = 'CONFIRMING'");
    const whereIdx = fnBody.indexOf("where", updateIdx);
    const returningIdx = fnBody.indexOf("returning", whereIdx);
    const whereClause = fnBody.slice(whereIdx, returningIdx);
    assert.match(whereClause, /status = 'PENDING_PAYMENT'/);
    assert.match(whereClause, /expires_at > now\(\)/);
  });

  test("o UPDATE que marca EXPIRED é posterior ao `won := false` (é cosmético, não faz parte da recusa)", () => {
    const wonFalseIdx = fnBody.indexOf("won := false");
    const expiredUpdateIdx = fnBody.indexOf("set status = 'EXPIRED'");
    assert.ok(wonFalseIdx > -1 && expiredUpdateIdx > -1 && wonFalseIdx < expiredUpdateIdx);
  });
});

// ---------------------------------------------------------------------
// 3) Falha fechada quando o Supabase não está configurado/indisponível
// ---------------------------------------------------------------------
describe("Falha fechada: disponibilidade nunca mostra horário livre sem o Supabase", () => {
  test("checa isSupabaseConfigured() e responde 503 ANTES de consultar o Google ou montar a lista de slots", () => {
    const checkIdx = disponibilidade.indexOf("isSupabaseConfigured()");
    const googleIdx = disponibilidade.indexOf("getBusyRanges(");
    const slotsReturnIdx = disponibilidade.lastIndexOf("slots: afterGoogle.map");
    assert.ok(checkIdx > -1, "deveria checar isSupabaseConfigured()");
    assert.ok(checkIdx < googleIdx, "checagem do Supabase deveria vir antes da chamada ao Google");
    assert.ok(checkIdx < slotsReturnIdx, "checagem do Supabase deveria vir antes de montar a resposta com slots");
  });

  test("responde 503 (não 200 com lista vazia nem lista otimista) quando não configurado", () => {
    const checkIdx = disponibilidade.indexOf("isSupabaseConfigured()");
    const trecho = disponibilidade.slice(checkIdx, checkIdx + 250);
    assert.match(trecho, /503/);
  });

  test("erro ao consultar reservas no Supabase (Supabase configurado mas indisponível) responde 502, não 200", () => {
    const errIdx = disponibilidade.indexOf("erro ao consultar reservas no Supabase");
    const trecho = disponibilidade.slice(errIdx, errIdx + 350);
    assert.match(trecho, /502/);
  });

  test("nunca cria/expõe reserva usando só o Google -- reservar também exige Supabase configurado antes de qualquer outra checagem de negócio", () => {
    const checkIdx = reservar.indexOf("isSupabaseConfigured()");
    const createIdx = reservar.indexOf("createBooking(");
    const googleIdx = reservar.indexOf("getBusyRanges(");
    assert.ok(checkIdx > -1 && checkIdx < createIdx);
    assert.ok(checkIdx < googleIdx, "checagem do Supabase deveria vir antes até da consulta ao Google");
  });

  test("mensagens de erro do Supabase nunca vazam pro cliente (sempre texto genérico, nunca err.message/err.body na resposta)", () => {
    for (const arquivo of [disponibilidade, reservar]) {
      // toda resposta de erro é um literal de string fixo -- nunca
      // interpola err.message/err.body dentro de jsonNoStore(...)
      const respostasComErro = arquivo.match(/jsonNoStore\(\s*\{[^}]*error:[^}]*\}/gs) || [];
      assert.ok(respostasComErro.length > 0);
      for (const resp of respostasComErro) {
        assert.ok(!/err\.(message|body|stack)/.test(resp), `resposta ao cliente vazando detalhe interno: ${resp}`);
      }
    }
  });
});

// ---------------------------------------------------------------------
// 4) Concorrência real no SQL: advisory lock determinístico
// ---------------------------------------------------------------------
describe("Concorrência real: advisory lock com chave determinística e independente de timezone", () => {
  test("usa extract(epoch from ...) -- nunca hashtext nem hash de texto formatado (sensível a timezone da sessão)", () => {
    assert.match(migration, /extract\(epoch from p_starts_at\)/);
    assert.doesNotMatch(migration, /hashtext\(/i);
    assert.doesNotMatch(migration, /md5\(p_starts_at/i, "não deveria mais hashear a representação textual de starts_at");
  });

  test("pg_advisory_xact_lock é chamado com a chave derivada do epoch", () => {
    assert.match(migration, /pg_advisory_xact_lock\(v_lock_key\)/);
    const lockKeyIdx = migration.indexOf("v_lock_key := floor(extract(epoch");
    const lockCallIdx = migration.indexOf("pg_advisory_xact_lock(v_lock_key)");
    assert.ok(lockKeyIdx > -1 && lockCallIdx > lockKeyIdx);
  });

  test("o exists-check de slot_taken acontece DEPOIS de adquirir o lock (nunca antes)", () => {
    const lockIdx = migration.indexOf("perform pg_advisory_xact_lock(v_lock_key)");
    const existsIdx = migration.indexOf("raise exception 'slot_taken'");
    assert.ok(lockIdx > -1 && existsIdx > lockIdx);
  });

  test("é dentro da MESMA função (create_booking) -- lock, re-checagem e insert não estão espalhados em funções separadas", () => {
    const fnStart = migration.indexOf("create or replace function public.create_booking");
    const fnEnd = migration.indexOf("$$;", fnStart);
    const fnBody = migration.slice(fnStart, fnEnd);
    assert.match(fnBody, /pg_advisory_xact_lock/);
    assert.match(fnBody, /raise exception 'slot_taken'/);
    assert.match(fnBody, /insert into public\.bookings/);
  });
});

// ---------------------------------------------------------------------
// 5) Idempotência: reconfirmada DEPOIS do lock, nunca tratada como slot_taken
// ---------------------------------------------------------------------
describe("Idempotência: chave única, reconfirmada após o lock, nunca gera conflito falso", () => {
  test("índice único parcial em idempotency_key (só quando não-nulo)", () => {
    assert.match(migration, /create unique index if not exists idx_bookings_idempotency_key/);
    assert.match(migration, /where idempotency_key is not null/);
  });

  test("a checagem de idempotência aparece DUAS vezes dentro de create_booking: antes E depois do lock", () => {
    const fnStart = migration.indexOf("create or replace function public.create_booking");
    const fnEnd = migration.indexOf("$$;", fnStart);
    const fnBody = migration.slice(fnStart, fnEnd);
    const lockIdx = fnBody.indexOf("perform pg_advisory_xact_lock");
    const ocorrenciasAntes = (fnBody.slice(0, lockIdx).match(/where idempotency_key = p_idempotency_key/g) || []).length;
    const ocorrenciasDepois = (fnBody.slice(lockIdx).match(/where idempotency_key = p_idempotency_key/g) || []).length;
    assert.ok(ocorrenciasAntes >= 1, "deveria ter uma checagem otimista antes do lock");
    assert.ok(ocorrenciasDepois >= 1, "deveria ter a checagem autoritativa depois do lock");
  });

  test("a re-checagem pós-lock acontece ANTES do exists-check de slot_taken", () => {
    const fnStart = migration.indexOf("create or replace function public.create_booking");
    const fnEnd = migration.indexOf("$$;", fnStart);
    const fnBody = migration.slice(fnStart, fnEnd);
    const lockIdx = fnBody.indexOf("perform pg_advisory_xact_lock");
    const idempPosLockIdx = fnBody.indexOf("where idempotency_key = p_idempotency_key", lockIdx);
    const slotTakenIdx = fnBody.indexOf("raise exception 'slot_taken'");
    assert.ok(idempPosLockIdx > lockIdx && idempPosLockIdx < slotTakenIdx);
  });

  test("mesma chave + assinatura diferente -> idempotency_conflict (nunca sobrescreve)", () => {
    const ocorrencias = (migration.match(/raise exception 'idempotency_conflict'/g) || []).length;
    assert.ok(ocorrencias >= 2, "deveria aparecer na checagem otimista e na pós-lock");
  });

  test("corrida na própria idempotency_key (unique_violation) é tratada -- nunca deixa a exceção genérica vazar", () => {
    assert.match(migration, /exception when unique_violation then/);
  });

  test("resposta da API de reservar nunca inclui PII na mensagem de conflito de idempotência", () => {
    const idx = reservar.indexOf("idempotency_conflict");
    const trecho = reservar.slice(idx, idx + 300);
    for (const campo of ["patient_name", "patient_email", "patient_phone", "nome", "email", "whatsapp"]) {
      assert.ok(!trecho.includes(campo), `resposta de conflito não deveria mencionar ${campo}`);
    }
  });
});

// ---------------------------------------------------------------------
// 6) Segurança das RPCs: RLS, REVOKE/GRANT, SECURITY DEFINER, search_path
// ---------------------------------------------------------------------
describe("Segurança das RPCs na migration", () => {
  const FUNCOES = ["create_booking", "begin_confirmation", "finalize_confirmation", "revert_to_pending", "mark_unknown", "reject_booking"];

  test("RLS habilitada na tabela, sem nenhuma CREATE POLICY (nenhuma policy pública)", () => {
    assert.match(migration, /alter table public\.bookings enable row level security/);
    assert.doesNotMatch(migration, /create policy/i);
  });

  test("tabela e view: REVOKE de public/anon/authenticated, GRANT só pra service_role", () => {
    assert.match(migration, /revoke all on public\.bookings from public, anon, authenticated/);
    assert.match(migration, /grant select, insert, update, delete on public\.bookings to service_role/);
    assert.match(migration, /revoke all on public\.active_bookings from public, anon, authenticated/);
    assert.match(migration, /grant select on public\.active_bookings to service_role/);
  });

  for (const fn of FUNCOES) {
    test(`${fn}: SECURITY DEFINER + search_path fixo + REVOKE de public/anon/authenticated + GRANT só service_role`, () => {
      const fnStart = migration.indexOf(`create or replace function public.${fn}(`);
      assert.ok(fnStart > -1, `função ${fn} não encontrada`);
      const fnEnd = migration.indexOf("$$;", fnStart);
      const fnBody = migration.slice(fnStart, fnEnd);
      assert.match(fnBody, /security definer/);
      assert.match(fnBody, /set search_path = public, pg_temp/);

      const revokeRe = new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`);
      const grantRe = new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`);
      assert.match(migration, revokeRe, `esperava REVOKE explícito pra ${fn}`);
      assert.match(migration, grantRe, `esperava GRANT explícito só pra service_role em ${fn}`);
    });
  }

  test("todas as referências a `bookings`/`active_bookings` dentro das funções são qualificadas com o schema `public.`", () => {
    for (const fn of FUNCOES) {
      const fnStart = migration.indexOf(`create or replace function public.${fn}(`);
      const fnEnd = migration.indexOf("$$;", fnStart);
      const fnBody = migration.slice(fnStart, fnEnd);
      // qualquer "from bookings"/"into bookings"/"update bookings" SEM o
      // prefixo "public." indicaria uma referência não-qualificada,
      // sujeita a sequestro via search_path malicioso.
      assert.doesNotMatch(fnBody, /(from|into|update|insert into)\s+bookings\b/i, `${fn} tem referência não-qualificada a bookings`);
    }
  });

  test("nenhuma função usa SQL dinâmico (EXECUTE 'string' ou format() construindo comando)", () => {
    assert.doesNotMatch(migration, /\bEXECUTE\s+'/i);
    assert.doesNotMatch(migration, /\bformat\(/i);
  });

  test("view active_bookings usa security_invoker (não herda privilégio elevado do dono da view)", () => {
    const viewIdx = migration.indexOf("create or replace view public.active_bookings");
    const trecho = migration.slice(viewIdx, viewIdx + 200);
    assert.match(trecho, /security_invoker\s*=\s*true/);
  });
});

// ---------------------------------------------------------------------
// 7) Rota pública de status: anti-enumeração + rate limit + no-store
// ---------------------------------------------------------------------
describe("GET /api/agendar/reserva/[codigo]/status -- anti-enumeração", () => {
  test("formato inválido e código inexistente respondem com o MESMO corpo/status (sem oráculo)", () => {
    assert.match(status, /NOT_FOUND_RESPONSE/);
    const ocorrencias = (status.match(/NOT_FOUND_RESPONSE/g) || []).length;
    assert.ok(ocorrencias >= 3, "constante deveria ser reaproveitada em ambos os caminhos (declaração + 2 usos)");
  });

  test("valida formato/tamanho ANTES de consultar o banco", () => {
    const validaIdx = status.indexOf("CODE_RE.test(codigo)");
    const consultaIdx = status.indexOf("getBookingByPublicCode(codigo)");
    assert.ok(validaIdx > -1 && validaIdx < consultaIdx);
  });

  test("tem rate limit próprio", () => {
    assert.match(status, /isRateLimited\(`reserva-status:/);
  });

  test("resposta é sempre no-store", () => {
    assert.match(status, /Cache-Control["']?:\s*["']no-store["']/);
  });

  test("nunca retorna id interno (UUID) nem status raw sem passar por effectiveStatus", () => {
    assert.doesNotMatch(status, /\bid:\s*booking\.id\b/);
    assert.match(status, /effectiveStatus\(booking\)/);
  });
});

// ---------------------------------------------------------------------
// 8) CSRF (Origin) e rate limit nas ações administrativas de escrita
// ---------------------------------------------------------------------
describe("Ações administrativas de escrita validam Origin (defesa em profundidade contra CSRF)", () => {
  for (const [nome, codigo] of [
    ["confirmar", adminConfirmar],
    ["rejeitar", adminRejeitar],
    ["logout", adminLogout],
  ]) {
    test(`${nome}: chama isAllowedOrigin(request)`, () => {
      assert.match(codigo, /isAllowedOrigin\(request\)/);
    });
  }

  test("confirmar e rejeitar têm rate limit próprio", () => {
    assert.match(adminConfirmar, /isRateLimited\(`admin-confirmar:/);
    assert.match(adminRejeitar, /isRateLimited\(`admin-rejeitar:/);
  });

  test("nenhuma rota administrativa de escrita exporta um handler GET (nenhuma ação administrativa funciona por GET)", () => {
    for (const codigo of [adminConfirmar, adminRejeitar, adminLogout]) {
      assert.doesNotMatch(codigo, /export\s+async\s+function\s+GET/);
    }
  });
});

// ---------------------------------------------------------------------
// 9) CORREÇÃO: reject_booking não pode mais afetar CONFIRMING (corrida
// rejeitar-durante-confirmação)
// ---------------------------------------------------------------------
describe("reject_booking -- corrigido pra NUNCA aceitar a partir de CONFIRMING", () => {
  const fnStart = migration.indexOf("create or replace function public.reject_booking");
  const fnEnd = migration.indexOf("$$;", fnStart);
  const fnBody = migration.slice(fnStart, fnEnd);

  test("o UPDATE só aceita status = 'PENDING_PAYMENT' -- nunca IN (..., 'CONFIRMING')", () => {
    assert.match(fnBody, /where id = p_id and status = 'PENDING_PAYMENT'/);
    assert.doesNotMatch(fnBody, /status in \('PENDING_PAYMENT', 'CONFIRMING'\)/);
    assert.doesNotMatch(fnBody, /'CONFIRMING'/, "reject_booking não deveria mencionar CONFIRMING em lugar nenhum do corpo");
  });

  test("o comentário da função documenta a corrida corrigida", () => {
    const comentario = migration.slice(migration.indexOf("-- RPC: reject_booking"), fnStart);
    assert.match(comentario, /CORREÇÃO DE SEGURANÇA/);
    assert.match(comentario, /finalize_confirmation/);
  });
});

// ---------------------------------------------------------------------
// 10) Rota admin/confirmar: nunca declara sucesso sem status CONFIRMED real
// ---------------------------------------------------------------------
describe("Rota admin/confirmar -- só declara sucesso quando finalize_confirmation devolve CONFIRMED de verdade", () => {
  test("checa finalBooking.status !== CONFIRMED entre finalize_confirmation e a resposta de sucesso", () => {
    const finalizeIdx = adminConfirmar.indexOf("finalizeConfirmation(id,");
    const checkIdx = adminConfirmar.indexOf("finalBooking.status !== BookingStatus.CONFIRMED");
    const sucessoIdx = adminConfirmar.lastIndexOf("publicId: finalBooking.public_code");
    assert.ok(finalizeIdx > -1 && checkIdx > finalizeIdx && checkIdx < sucessoIdx);
  });

  test("no caminho de status inesperado, marca UNKNOWN e responde 502 -- nunca 200", () => {
    const checkIdx = adminConfirmar.indexOf("finalBooking.status !== BookingStatus.CONFIRMED");
    const trecho = adminConfirmar.slice(checkIdx, checkIdx + 800);
    assert.match(trecho, /markUnknown\(id\)/);
    assert.match(trecho, /502/);
  });
});

// ---------------------------------------------------------------------
// 11) Rota admin/rejeitar: nunca declara sucesso sem status PAYMENT_REJECTED real
// ---------------------------------------------------------------------
describe("Rota admin/rejeitar -- só declara sucesso quando o status devolvido é PAYMENT_REJECTED de verdade", () => {
  test("checa booking.status !== PAYMENT_REJECTED antes da resposta de sucesso", () => {
    const rejectIdx = adminRejeitar.indexOf("rejectBooking(id)");
    const checkIdx = adminRejeitar.indexOf("booking.status !== BookingStatus.PAYMENT_REJECTED");
    const sucessoIdx = adminRejeitar.lastIndexOf("ok: true, publicId: booking.public_code");
    assert.ok(rejectIdx > -1 && checkIdx > rejectIdx && checkIdx < sucessoIdx);
  });

  test("no caminho de status inesperado, responde 409 -- nunca 200", () => {
    const checkIdx = adminRejeitar.indexOf("booking.status !== BookingStatus.PAYMENT_REJECTED");
    const trecho = adminRejeitar.slice(checkIdx, checkIdx + 300);
    assert.match(trecho, /409/);
  });
});

// ---------------------------------------------------------------------
// 12) Validações defensivas dentro de create_booking
// ---------------------------------------------------------------------
describe("create_booking -- validações defensivas de entrada", () => {
  const fnStart = migration.indexOf("create or replace function public.create_booking");
  const fnEnd = migration.indexOf("$$;", fnStart);
  const fnBody = migration.slice(fnStart, fnEnd);

  test("p_hold_minutes precisa estar entre 1 e 120", () => {
    assert.match(fnBody, /p_hold_minutes < 1 or p_hold_minutes > 120/);
    assert.match(fnBody, /raise exception 'invalid_hold_minutes'/);
  });

  test("p_ends_at precisa ser estritamente depois de p_starts_at", () => {
    assert.match(fnBody, /p_ends_at <= p_starts_at/);
    assert.match(fnBody, /raise exception 'invalid_time_range'/);
  });

  test("p_public_code não pode ser vazio/só espaços", () => {
    assert.match(fnBody, /length\(trim\(p_public_code\)\) = 0/);
    assert.match(fnBody, /raise exception 'invalid_public_code'/);
  });

  test("p_idempotency_key, quando fornecida, não pode ser vazia (mas continua opcional -- null é válido)", () => {
    assert.match(fnBody, /p_idempotency_key is not null and length\(trim\(p_idempotency_key\)\) = 0/);
    assert.match(fnBody, /raise exception 'invalid_idempotency_key'/);
  });

  test("p_request_signature não pode ser nula nem vazia", () => {
    assert.match(fnBody, /p_request_signature is null or length\(trim\(p_request_signature\)\) = 0/);
    assert.match(fnBody, /raise exception 'invalid_request_signature'/);
  });

  test("p_booking_time precisa bater com o formato HH:MM, com hora numa faixa válida (00-23)", () => {
    assert.match(fnBody, /p_booking_time !~ '\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$'/);
    assert.match(fnBody, /raise exception 'invalid_booking_time_format'/);
    // regressão: o padrão antigo ^[0-2][0-9]:... não deveria mais existir
    // (aceitava incorretamente 24:00/27:30/29:59 como formato válido).
    assert.doesNotMatch(fnBody, /!~ '\^\[0-2\]\[0-9\]:\[0-5\]\[0-9\]\$'/);
  });

  test("booking_date precisa estar a no máximo 1 dia da data de starts_at (checagem grosseira, sem duplicar timezone)", () => {
    assert.match(fnBody, /abs\(p_starts_at::date - p_booking_date\) > 1/);
    assert.match(fnBody, /raise exception 'inconsistent_booking_date'/);
  });

  test("todas as validações rodam ANTES da checagem de idempotência e do advisory lock", () => {
    const primeiraValidacaoIdx = fnBody.indexOf("invalid_hold_minutes");
    const idempIdx = fnBody.indexOf("Checagem otimista de idempotência");
    const lockIdx = fnBody.indexOf("perform pg_advisory_xact_lock");
    assert.ok(primeiraValidacaoIdx > -1 && primeiraValidacaoIdx < idempIdx && idempIdx < lockIdx);
  });

  test("cada TIPO de validação usa um errcode P00xx distinto (P0001 legitimamente se repete nas 3 checagens de idempotência -- ver item 5 da auditoria; os demais nunca se repetem)", () => {
    const codigos = [...fnBody.matchAll(/errcode = '(P00\d\d)'/g)].map((m) => m[1]);
    const distintos = new Set(codigos);
    // P0001 (idempotency_conflict) aparece 3x de propósito (checagem
    // otimista, re-checagem pós-lock, e no bloco EXCEPTION de
    // unique_violation) -- todas as OUTRAS validações (P0002 em diante)
    // devem aparecer exatamente uma vez cada.
    const contagemP0001 = codigos.filter((c) => c === "P0001").length;
    assert.equal(contagemP0001, 3, `P0001 (idempotency_conflict) deveria aparecer 3x, achou ${contagemP0001}`);
    const outros = codigos.filter((c) => c !== "P0001");
    assert.equal(new Set(outros).size, outros.length, "fora o P0001, nenhum outro errcode deveria se repetir");
    assert.ok(distintos.size >= 10, `esperava pelo menos 10 errcodes distintos (P0001..P0010), achou ${distintos.size}`);
  });
});

// ---------------------------------------------------------------------
// 13) Trigger function sem EXECUTE público
// ---------------------------------------------------------------------
describe("bookings_set_updated_at (função de trigger) -- sem EXECUTE público", () => {
  test("REVOKE ALL de public/anon/authenticated", () => {
    assert.match(migration, /revoke all on function public\.bookings_set_updated_at\(\) from public, anon, authenticated/);
  });

  test("nenhum GRANT EXECUTE explícito -- gatilho não depende disso pra funcionar", () => {
    assert.doesNotMatch(migration, /grant execute on function public\.bookings_set_updated_at/);
  });
});

// ---------------------------------------------------------------------
// 14) Sem referências a nomes de arquivo obsoletos nos comentários
// ---------------------------------------------------------------------
describe("Migration não referencia nomes antigos de arquivos de teste/script", () => {
  test("não cita mais scripts/test-supabase-bookings.mjs (renomeado pra verify-supabase-bookings.mjs)", () => {
    assert.doesNotMatch(migration, /scripts\/test-supabase-bookings\.mjs/);
  });

  test("não cita mais tests/migrationSecurity.test.js (o arquivo real é tests/auditCorrections.test.js)", () => {
    assert.doesNotMatch(migration, /tests\/migrationSecurity\.test\.js/);
  });
});

// ---------------------------------------------------------------------
// 15) p_booking_time -- correção da faixa de hora válida (00-23)
// ---------------------------------------------------------------------
describe("create_booking -- regex de p_booking_time aceita só horas 00-23 (corrigido)", () => {
  // Espelho EXATO, em JS, do padrão agora usado no SQL -- permite testar
  // exaustivamente casos que a auditoria pediu, já que não há Postgres
  // disponível neste ambiente pra rodar a regex real.
  const BOOKING_TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

  test("aceita 00:00 (início do intervalo)", () => {
    assert.match("00:00", BOOKING_TIME_RE);
  });

  test("aceita 23:59 (fim do intervalo)", () => {
    assert.match("23:59", BOOKING_TIME_RE);
  });

  test("aceita os 4 horários fixos reais da agenda", () => {
    for (const h of ["08:00", "11:00", "14:00", "17:00"]) {
      assert.match(h, BOOKING_TIME_RE, `${h} deveria ser aceito`);
    }
  });

  test("rejeita 24:00 (hora 24 não existe)", () => {
    assert.doesNotMatch("24:00", BOOKING_TIME_RE);
  });

  test("rejeita 27:30 (hora inválida, mas passaria no padrão antigo ^[0-2][0-9])", () => {
    assert.doesNotMatch("27:30", BOOKING_TIME_RE);
  });

  test("rejeita 29:59 (hora inválida, mas passaria no padrão antigo ^[0-2][0-9])", () => {
    assert.doesNotMatch("29:59", BOOKING_TIME_RE);
  });

  test("rejeita 9:00 (falta o zero à esquerda -- formato precisa ser HH:MM, nunca H:MM)", () => {
    assert.doesNotMatch("9:00", BOOKING_TIME_RE);
  });

  test("o SQL usa exatamente este padrão (checagem textual, garante que o espelho em JS não diverge do real)", () => {
    const fnStart = migration.indexOf("create or replace function public.create_booking");
    const fnEnd = migration.indexOf("$$;", fnStart);
    const fnBody = migration.slice(fnStart, fnEnd);
    assert.match(fnBody, /p_booking_time !~ '\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$'/);
  });
});

// ---------------------------------------------------------------------
// 16) finalize_confirmation -- reforço: nunca confirma sem evidência real
// do evento no Google
// ---------------------------------------------------------------------
describe("finalize_confirmation -- reforço de segurança (nunca confirma sem evento real)", () => {
  const fnStart = migration.indexOf("create or replace function public.finalize_confirmation");
  const fnEnd = migration.indexOf("$$;", fnStart);
  const fnBody = migration.slice(fnStart, fnEnd);

  test("NÃO faz nenhum SELECT antes do UPDATE -- a primeira instrução executada é o próprio UPDATE (fecha a corrida residual)", () => {
    const beginIdx = fnBody.indexOf("as $$");
    const updateIdx = fnBody.indexOf("update public.bookings");
    const trechoAntesDoUpdate = fnBody.slice(beginIdx, updateIdx);
    assert.doesNotMatch(trechoAntesDoUpdate, /select \* into v/i, "não deveria haver SELECT nenhum antes do UPDATE");
  });

  test("todas as validações (evento presente, Meet no host exato) moram DENTRO do WHERE do UPDATE", () => {
    const updateIdx = fnBody.indexOf("update public.bookings");
    const returningIdx = fnBody.indexOf("returning * into v;", updateIdx);
    const updateStatement = fnBody.slice(updateIdx, returningIdx);
    assert.match(updateStatement, /and status = 'CONFIRMING'/);
    assert.match(updateStatement, /and p_google_event_id is not null/);
    assert.match(updateStatement, /and btrim\(p_google_event_id\) <> ''/);
    assert.match(updateStatement, /mode <> 'online'/);
    assert.match(updateStatement, /p_google_meet_url like 'https:\/\/meet\.google\.com\/%'/);
  });

  test("Meet precisa pertencer EXATAMENTE ao host https://meet.google.com/ -- nunca outro domínio, nunca http://", () => {
    assert.match(fnBody, /p_google_meet_url like 'https:\/\/meet\.google\.com\/%'/);
    assert.doesNotMatch(fnBody, /!~ '\^https:\/\/'/, "não deveria mais usar o padrão genérico 'qualquer https://' -- precisa ser o host exato do Meet");
  });

  test("reservas mode='presencial' não são obrigadas a ter meet_url (a condição 'mode <> online' já libera o WHERE pra elas)", () => {
    assert.match(fnBody, /mode <> 'online'\s*\n\s*or \(p_google_meet_url is not null/);
  });

  test("se o UPDATE não afeta nenhuma linha, busca o estado ATUAL via SELECT novo -- nunca reaproveita `v` de antes da tentativa de escrita", () => {
    const returningIdx = fnBody.indexOf("returning * into v;");
    const ifFoundIdx = fnBody.indexOf("if found then", returningIdx);
    const fallbackSelectIdx = fnBody.indexOf("select * into v from public.bookings where id = p_id;", ifFoundIdx);
    assert.ok(ifFoundIdx > -1 && fallbackSelectIdx > ifFoundIdx, "esperava 'if found' logo após o UPDATE, e o SELECT de fallback só depois disso");
  });

  test("o SELECT de fallback é a ÚNICA leitura da linha em todo o corpo da função (nenhuma leitura antecipada)", () => {
    const ocorrenciasSelect = (fnBody.match(/select \* into v/g) || []).length;
    assert.equal(ocorrenciasSelect, 1, "deveria haver exatamente 1 SELECT (o de fallback, depois do UPDATE)");
  });

  test("nunca usa dado clínico nem financeiro dentro desta função (só id/status/campos do Google)", () => {
    for (const termo of ["motivo", "sintoma", "diagnostico", "valor", "sinal", "R$"]) {
      assert.ok(!fnBody.toLowerCase().includes(termo.toLowerCase()), `finalize_confirmation não deveria mencionar "${termo}"`);
    }
  });
});

// ---------------------------------------------------------------------
// 17) isValidGoogleMeetUrl -- espelho testável do critério `like
// 'https://meet.google.com/%'` usado por finalize_confirmation
// ---------------------------------------------------------------------
describe("isValidGoogleMeetUrl (espelho da validação de Meet do finalize_confirmation)", () => {
  test("aceita um link real do Google Meet", () => {
    assert.equal(isValidGoogleMeetUrl("https://meet.google.com/abc-defg-hij"), true);
  });

  test("rejeita outro domínio HTTPS (mesmo contendo 'meet.google.com' em outro lugar da URL)", () => {
    assert.equal(isValidGoogleMeetUrl("https://evil.example.com/meet.google.com/abc"), false);
    assert.equal(isValidGoogleMeetUrl("https://meet.google.com.evil.example.com/abc"), false);
  });

  test("rejeita http:// (mesmo host, mas sem HTTPS)", () => {
    assert.equal(isValidGoogleMeetUrl("http://meet.google.com/abc-defg-hij"), false);
  });

  test("rejeita nulo, vazio, e valores não-string", () => {
    assert.equal(isValidGoogleMeetUrl(null), false);
    assert.equal(isValidGoogleMeetUrl(undefined), false);
    assert.equal(isValidGoogleMeetUrl(""), false);
    assert.equal(isValidGoogleMeetUrl(123), false);
  });

  test("rejeita o host exato sem nenhum código depois da barra", () => {
    assert.equal(isValidGoogleMeetUrl("https://meet.google.com/"), false);
  });
});
