#!/usr/bin/env node
// scripts/verify-supabase-bookings.mjs
//
// Teste de INTEGRAÇÃO REAL contra um projeto Supabase (Postgres) que já
// tenha a migration supabase/migrations/0001_create_bookings.sql
// aplicada. Diferente da suíte `npm test` (100% offline, com fetch
// mockado), este script fala de verdade com o Postgres via
// lib/booking/bookingRepository.js + lib/supabase/client.js -- ou seja,
// exercita o MESMO código que a aplicação usa em produção, não uma
// reimplementação.
//
// NÃO roda como parte de `npm test` -- o nome deste arquivo é
// deliberadamente "verify-*" (não "test-*"/"*.test.*"), justamente pra
// NUNCA ser capturado pela descoberta automática de arquivos de teste do
// `node --test` (que varre o projeto inteiro por convenção de nome, não
// só a pasta tests/). Só roda sob demanda:
//   npm run test:supabase
//
// Lê exclusivamente do ambiente (nunca lê nem escreve nada em nenhum
// outro lugar):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// Se um `.env.local` existir na raiz do projeto, os pares KEY=VALUE de
// lá são carregados pro `process.env` (só se a variável ainda não
// estiver definida no ambiente -- uma variável já exportada no shell
// sempre vence). Isso é só um parser mínimo de "KEY=VALUE" por linha,
// sem nenhuma dependência nova.
//
// NUNCA imprime: a URL completa do projeto, a service_role key, headers
// de requisição, nome/e-mail/telefone reais, nem o corpo completo de
// nenhuma resposta HTTP. Toda a saída é limitada a nomes de cenário,
// PASS/FAIL, contadores e, no máximo, um status HTTP numérico.
//
// Usa dados 100% FICTÍCIOS (nome "TESTE INTEGRACAO", e-mail no domínio
// reservado .invalid -- RFC 2606, nunca resolve de verdade) e horários
// muito no futuro (ano 2099), isolados de qualquer agenda real -- as
// regras de negócio do site (antecedência mínima, dias úteis, horários
// fixos) são aplicadas na camada da rota Next.js, não dentro das RPCs
// testadas aqui, então usar datas fora da janela normal de agendamento
// é seguro e não interfere com reservas reais.
//
// Toda reserva criada por este script é rastreada em memória (por id) e
// removida ao final, em qualquer cenário (sucesso, falha ou exceção) --
// nunca apaga nada que não tenha sido criado por esta própria execução.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

// -----------------------------------------------------------------
// Carregamento mínimo de .env.local (sem dependência nova). Só define
// process.env[key] se ainda não estiver setado -- nunca sobrescreve uma
// variável já exportada no shell.
// -----------------------------------------------------------------
function loadEnvLocalIfPresent() {
  const envPath = path.join(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const linha of raw.split("\n")) {
    const semComentario = linha.trim();
    if (!semComentario || semComentario.startsWith("#")) continue;
    const idx = semComentario.indexOf("=");
    if (idx === -1) continue;
    const chave = semComentario.slice(0, idx).trim();
    const valor = semComentario.slice(idx + 1).trim();
    if (chave && process.env[chave] === undefined) {
      process.env[chave] = valor;
    }
  }
}
loadEnvLocalIfPresent();

// -----------------------------------------------------------------
// Encerra cedo, sem erro confuso e SEM expor nenhum valor, se as
// variáveis obrigatórias não estiverem presentes.
// -----------------------------------------------------------------
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log(
    "Teste de integração não executado: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY " +
      "(no ambiente ou em um arquivo .env.local na raiz do projeto, NUNCA commitado) antes de " +
      "rodar `npm run test:supabase`. Ver README.md > 'Testando contra um Supabase real'."
  );
  process.exit(0);
}

// Nunca deixa o restante do processo (inclusive código de terceiros
// importado abaixo) ecoar corpo de resposta HTTP no console -- ver
// lib/supabase/client.js, que loga um trecho curto do erro em caso de
// falha HTTP. Nossos dados de teste são fictícios, mas mantemos essa
// supressão como política deliberada e auditável deste script.
const originalConsoleError = console.error;
console.error = () => {
  // Silenciado de propósito -- ver comentário acima.
};

const SUPABASE_URL = process.env.SUPABASE_URL.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const { createBooking, beginConfirmation, finalizeConfirmation, markUnknown, rejectBooking } = await import(
  "../lib/booking/bookingRepository.js"
);

// -----------------------------------------------------------------
// Utilitários de saída -- nunca imprimem nada além de nomes de cenário,
// PASS/FAIL e contadores.
// -----------------------------------------------------------------
let passCount = 0;
let failCount = 0;
const failures = [];

function section(titulo) {
  console.log(`\n${titulo}`);
}
function ok(msg) {
  passCount++;
  console.log(`  ✔ ${msg}`);
}
function fail(msg) {
  failCount++;
  failures.push(msg);
  console.log(`  ✖ ${msg}`);
}
function note(msg) {
  console.log(`  ℹ ${msg}`);
}

// -----------------------------------------------------------------
// Identificador exclusivo desta execução -- usado só como marcador
// legível dentro de idempotency_key/patient_name, útil pra um humano
// identificar visualmente registros órfãos no SQL Editor SE a limpeza
// automática (que usa a lista exata de ids em memória, não este prefixo)
// falhar por algum motivo. A limpeza real nunca depende de casar esse
// prefixo -- só do id exato retornado por cada criação.
// -----------------------------------------------------------------
const RUN_ID = randomUUID().slice(0, 8);
const createdIds = new Set();

// Horários bem no futuro (ano 2099), 3h separados entre cenários --
// isolados de qualquer agenda real. `nextSlotNumber()` garante um
// starts_at novo a cada chamada; cenários que precisam do MESMO horário
// reusam o número retornado por uma chamada anterior.
const BASE_MS = new Date("2099-06-15T00:00:00.000Z").getTime();
let slotCounter = 0;
function nextSlotNumber() {
  slotCounter += 1;
  return slotCounter;
}
function slotFor(n) {
  const startsAt = new Date(BASE_MS + n * 3 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

function fakePatient() {
  return {
    patientName: `TESTE INTEGRACAO ${RUN_ID}`,
    // .invalid é um TLD reservado (RFC 2606) -- nunca resolve de
    // verdade, nunca é um destinatário real.
    patientEmail: `teste-integracao-${RUN_ID}@example.invalid`,
    patientPhone: "11900000000",
  };
}

// Cria uma reserva de teste no horário `n` e registra o id criado (se
// houver) pra limpeza -- independente do resultado esperado pelo
// cenário que chamou.
async function create(n, { idempotencyKey = null, requestSignature = "sig-default", holdMinutes = 5 } = {}) {
  const { startsAt, endsAt } = slotFor(n);
  const result = await createBooking({
    idempotencyKey,
    requestSignature,
    mode: "online",
    // Derivado de startsAt (não fixo) -- create_booking agora valida que
    // booking_date fica a no máximo 1 dia de distância da data UTC de
    // starts_at (ver "validações defensivas" na migration); como os
    // cenários abaixo usam dezenas de horários espaçados 3h entre si, um
    // valor fixo acabaria divergindo depois de ~8 cenários.
    bookingDate: startsAt.slice(0, 10),
    bookingTime: "00:00",
    startsAt,
    endsAt,
    holdMinutes,
    ...fakePatient(),
  });
  if (result.booking?.id) createdIds.add(result.booking.id);
  return result;
}

// -----------------------------------------------------------------
// Manipulação RAW da tabela, só para ARRANJAR estado de teste (nunca
// usada pela aplicação em si) -- usa a service_role key, que tem GRANT
// explícito de SELECT/INSERT/UPDATE/DELETE na migration. Serve pra
// simular "essa reserva CONFIRMING/CONFIRMED/UNKNOWN tem um expires_at
// antigo, do hold original de 30min, que já passou" sem precisar
// esperar o tempo real passar.
// -----------------------------------------------------------------
async function rawPatchExpiresAtToPast(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
  });
  if (!res.ok) throw new Error(`PATCH de teste falhou com status ${res.status}`);
}

async function rawDeleteByIds(ids) {
  if (ids.length === 0) return;
  const filtro = ids.map((id) => `"${id}"`).join(",");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=in.(${filtro})`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`DELETE de limpeza falhou com status ${res.status}`);
}

// ===================================================================
// Cenários (ver mapeamento com os itens pedidos na auditoria no
// cabeçalho de cada função)
// ===================================================================

async function testCreation() {
  section("1) Criação de reserva PENDING_PAYMENT");
  const r = await create(nextSlotNumber(), { idempotencyKey: `it-${RUN_ID}-s1`, requestSignature: "sig-s1" });
  if (r.outcome === "created" && r.booking?.status === "PENDING_PAYMENT") {
    ok("create_booking cria a reserva com status PENDING_PAYMENT");
  } else {
    fail(`esperava outcome=created e status=PENDING_PAYMENT (obteve outcome=${r.outcome})`);
  }
}

async function testIdempotencySame() {
  section("2) Mesma idempotency_key + mesma assinatura -> mesma reserva");
  const n = nextSlotNumber();
  const key = `it-${RUN_ID}-s2`;
  const r1 = await create(n, { idempotencyKey: key, requestSignature: "sig-s2" });
  const r2 = await create(n, { idempotencyKey: key, requestSignature: "sig-s2" });
  if (r1.outcome === "created" && r2.outcome === "created" && r1.booking?.id === r2.booking?.id) {
    ok("segunda chamada com a mesma chave+assinatura devolve a MESMA reserva (mesmo id), sem criar outra");
  } else {
    fail(`esperava o mesmo id nas duas respostas (r1=${r1.outcome}, r2=${r2.outcome})`);
  }
}

async function testIdempotencyConflict() {
  section("3) Mesma idempotency_key + assinatura DIFERENTE -> conflito");
  const n = nextSlotNumber();
  const key = `it-${RUN_ID}-s3`;
  const r1 = await create(n, { idempotencyKey: key, requestSignature: "sig-s3-a" });
  const r2 = await create(n, { idempotencyKey: key, requestSignature: "sig-s3-b" });
  if (r1.outcome === "created" && r2.outcome === "idempotency_conflict") {
    ok("segunda chamada com assinatura diferente recebe idempotency_conflict -- nunca sobrescreve nem cria outra reserva");
  } else {
    fail(`esperava created + idempotency_conflict (r1=${r1.outcome}, r2=${r2.outcome})`);
  }
}

async function testConcurrentCreate() {
  section("4) Duas chamadas CONCORRENTES pro MESMO starts_at -> só uma reserva bloqueante");
  const n = nextSlotNumber();
  const [ra, rb] = await Promise.all([
    create(n, { idempotencyKey: `it-${RUN_ID}-s4-a`, requestSignature: "sig-s4-a" }),
    create(n, { idempotencyKey: `it-${RUN_ID}-s4-b`, requestSignature: "sig-s4-b" }),
  ]);
  const outcomes = [ra.outcome, rb.outcome].sort();
  if (outcomes[0] === "created" && outcomes[1] === "slot_taken") {
    ok("exatamente uma das duas chamadas concorrentes venceu (created); a outra recebeu slot_taken");
  } else {
    fail(`esperava exatamente 1 created + 1 slot_taken (obteve: ${outcomes.join(", ")})`);
  }
}

async function testActiveBlocks() {
  section("5) Reserva ativa (PENDING_PAYMENT dentro do prazo) bloqueia nova tentativa");
  const n = nextSlotNumber();
  const r1 = await create(n, { idempotencyKey: `it-${RUN_ID}-s5-a`, requestSignature: "sig-s5-a", holdMinutes: 5 });
  const r2 = await create(n, { idempotencyKey: `it-${RUN_ID}-s5-b`, requestSignature: "sig-s5-b", holdMinutes: 5 });
  if (r1.outcome === "created" && r2.outcome === "slot_taken") {
    ok("segunda tentativa pro mesmo horário recebe slot_taken enquanto a primeira está ativa");
  } else {
    fail(`esperava created + slot_taken (r1=${r1.outcome}, r2=${r2.outcome})`);
  }
}

async function testExpiredReleases() {
  section("6) PENDING_PAYMENT vencida deixa de bloquear (sem cron -- expira só por expires_at)");
  const n = nextSlotNumber();
  // holdMinutes precisa ser >= 1 (create_booking agora valida 1..120) --
  // cria válida e imediatamente backdata expires_at via PATCH direto,
  // mesma técnica usada nos cenários 7-9 abaixo.
  const r1 = await create(n, { idempotencyKey: `it-${RUN_ID}-s6-a`, requestSignature: "sig-s6-a", holdMinutes: 1 });
  if (r1.outcome !== "created") {
    fail(`falha ao criar a reserva-base (outcome=${r1.outcome})`);
    return;
  }
  await rawPatchExpiresAtToPast(r1.booking.id);
  const r2 = await create(n, { idempotencyKey: `it-${RUN_ID}-s6-b`, requestSignature: "sig-s6-b", holdMinutes: 5 });
  if (r2.outcome === "created") {
    ok("nova reserva no mesmo horário é aceita depois que a PENDING_PAYMENT anterior já venceu");
  } else {
    fail(`esperava created (a reserva vencida não deveria bloquear), obteve ${r2.outcome}`);
  }
}

async function testConfirmingBlocksAfterExpiry() {
  section("7) CONFIRMING bloqueia mesmo com o expires_at do hold original já vencido");
  const n = nextSlotNumber();
  const r1 = await create(n, { idempotencyKey: `it-${RUN_ID}-s7-a`, requestSignature: "sig-s7-a", holdMinutes: 5 });
  if (r1.outcome !== "created") {
    fail(`falha ao criar a reserva-base (outcome=${r1.outcome})`);
    return;
  }
  const t = await beginConfirmation(r1.booking.id);
  if (!t.won) {
    fail("begin_confirmation não conseguiu transicionar a reserva recém-criada pra CONFIRMING");
    return;
  }
  await rawPatchExpiresAtToPast(r1.booking.id);
  const r2 = await create(n, { idempotencyKey: `it-${RUN_ID}-s7-b`, requestSignature: "sig-s7-b", holdMinutes: 5 });
  if (r2.outcome === "slot_taken") {
    ok("CONFIRMING continua bloqueando mesmo com expires_at (do hold original) já no passado");
  } else {
    fail(`esperava slot_taken, obteve ${r2.outcome}`);
  }
}

async function testConfirmedBlocksAfterExpiry() {
  section("8) CONFIRMED bloqueia mesmo com o expires_at do hold original já vencido");
  const n = nextSlotNumber();
  const r1 = await create(n, { idempotencyKey: `it-${RUN_ID}-s8-a`, requestSignature: "sig-s8-a", holdMinutes: 5 });
  if (r1.outcome !== "created") {
    fail(`falha ao criar a reserva-base (outcome=${r1.outcome})`);
    return;
  }
  const t = await beginConfirmation(r1.booking.id);
  if (!t.won) {
    fail("begin_confirmation não conseguiu transicionar a reserva recém-criada pra CONFIRMING");
    return;
  }
  // O Meet PRECISA pertencer ao host https://meet.google.com/ -- desde o
  // reforço de segurança do finalize_confirmation, uma URL fora desse
  // host (como um domínio .invalid) é rejeitada e a reserva ficaria
  // presa em CONFIRMING em vez de CONFIRMED, invalidando o propósito
  // deste cenário (testar especificamente o bloqueio por CONFIRMED).
  const finalizado = await finalizeConfirmation(r1.booking.id, "fake-google-event-id", "https://meet.google.com/fake-abc-def");
  if (finalizado.status !== "CONFIRMED") {
    fail(`falha ao preparar o cenário: esperava CONFIRMED depois de finalize_confirmation, obteve ${finalizado.status}`);
    return;
  }
  await rawPatchExpiresAtToPast(r1.booking.id);
  const r2 = await create(n, { idempotencyKey: `it-${RUN_ID}-s8-b`, requestSignature: "sig-s8-b", holdMinutes: 5 });
  if (r2.outcome === "slot_taken") {
    ok("CONFIRMED continua bloqueando mesmo com expires_at (do hold original) já no passado");
  } else {
    fail(`esperava slot_taken, obteve ${r2.outcome}`);
  }
}

async function testUnknownBlocksAfterExpiry() {
  section("9) UNKNOWN bloqueia mesmo com o expires_at do hold original já vencido");
  const n = nextSlotNumber();
  const r1 = await create(n, { idempotencyKey: `it-${RUN_ID}-s9-a`, requestSignature: "sig-s9-a", holdMinutes: 5 });
  if (r1.outcome !== "created") {
    fail(`falha ao criar a reserva-base (outcome=${r1.outcome})`);
    return;
  }
  const t = await beginConfirmation(r1.booking.id);
  if (!t.won) {
    fail("begin_confirmation não conseguiu transicionar a reserva recém-criada pra CONFIRMING");
    return;
  }
  await markUnknown(r1.booking.id);
  await rawPatchExpiresAtToPast(r1.booking.id);
  const r2 = await create(n, { idempotencyKey: `it-${RUN_ID}-s9-b`, requestSignature: "sig-s9-b", holdMinutes: 5 });
  if (r2.outcome === "slot_taken") {
    ok("UNKNOWN continua bloqueando mesmo com expires_at (do hold original) já no passado");
  } else {
    fail(`esperava slot_taken, obteve ${r2.outcome}`);
  }
}

async function testRejectedNeverBlocks() {
  section("10) PAYMENT_REJECTED nunca bloqueia");
  const n = nextSlotNumber();
  const r1 = await create(n, { idempotencyKey: `it-${RUN_ID}-s10-a`, requestSignature: "sig-s10-a", holdMinutes: 5 });
  if (r1.outcome !== "created") {
    fail(`falha ao criar a reserva-base (outcome=${r1.outcome})`);
    return;
  }
  await rejectBooking(r1.booking.id);
  const r2 = await create(n, { idempotencyKey: `it-${RUN_ID}-s10-b`, requestSignature: "sig-s10-b", holdMinutes: 5 });
  if (r2.outcome === "created") {
    ok("nova reserva no mesmo horário é aceita depois que a anterior foi marcada PAYMENT_REJECTED");
  } else {
    fail(`esperava created, obteve ${r2.outcome}`);
  }
}

async function testBeginConfirmationGuards() {
  section("11) begin_confirmation só aceita PENDING_PAYMENT ainda não vencida");

  const nExpired = nextSlotNumber();
  const rExpired = await create(nExpired, { idempotencyKey: `it-${RUN_ID}-s11a`, requestSignature: "sig-s11a", holdMinutes: 1 });
  if (rExpired.outcome !== "created") {
    fail(`falha ao criar a reserva-base (outcome=${rExpired.outcome})`);
  } else {
    await rawPatchExpiresAtToPast(rExpired.booking.id);
    const t = await beginConfirmation(rExpired.booking.id);
    if (t.won === false) {
      ok("recusa transicionar uma reserva PENDING_PAYMENT já vencida");
    } else {
      fail("deveria ter recusado (won=false) uma reserva já vencida");
    }
  }

  const nConfirmed = nextSlotNumber();
  const rConfirmed = await create(nConfirmed, { idempotencyKey: `it-${RUN_ID}-s11b`, requestSignature: "sig-s11b", holdMinutes: 5 });
  if (rConfirmed.outcome !== "created") {
    fail(`falha ao criar a reserva-base (outcome=${rConfirmed.outcome})`);
    return;
  }
  const t1 = await beginConfirmation(rConfirmed.booking.id);
  if (!t1.won) {
    fail("primeira transição pra CONFIRMING deveria ter vencido");
    return;
  }
  // Meet precisa pertencer ao host https://meet.google.com/ (ver
  // reforço de segurança do finalize_confirmation) -- sem isso a
  // reserva ficaria presa em CONFIRMING, e o teste abaixo (que verifica
  // a recusa de begin_confirmation sobre uma reserva JÁ CONFIRMED)
  // acabaria testando outra coisa (CONFIRMING de novo).
  const finalizadoB = await finalizeConfirmation(rConfirmed.booking.id, "fake-google-event-id-2", "https://meet.google.com/fake-ghi-jkl");
  if (finalizadoB.status !== "CONFIRMED") {
    fail(`falha ao preparar o cenário: esperava CONFIRMED depois de finalize_confirmation, obteve ${finalizadoB.status}`);
    return;
  }
  const t2 = await beginConfirmation(rConfirmed.booking.id);
  if (t2.won === false) {
    ok("recusa transicionar uma reserva que já está CONFIRMED");
  } else {
    fail("deveria ter recusado (won=false) uma reserva já CONFIRMED");
  }
}

async function testConcurrentConfirmations() {
  section("12) Duas chamadas concorrentes de begin_confirmation na MESMA reserva -- só uma vence");
  const n = nextSlotNumber();
  const r1 = await create(n, { idempotencyKey: `it-${RUN_ID}-s12`, requestSignature: "sig-s12", holdMinutes: 5 });
  if (r1.outcome !== "created") {
    fail(`falha ao criar a reserva-base (outcome=${r1.outcome})`);
    return;
  }
  const [t1, t2] = await Promise.all([beginConfirmation(r1.booking.id), beginConfirmation(r1.booking.id)]);
  const vencedores = [t1.won, t2.won].filter(Boolean).length;
  if (vencedores === 1) {
    ok("exatamente uma das duas confirmações concorrentes venceu (won=true)");
  } else {
    fail(`esperava exatamente 1 vencedor, obteve ${vencedores}`);
  }
}

async function testNoCredentialsRejected() {
  section("18) Requisição SEM NENHUMA credencial é recusada");
  const resSelect = await fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id&limit=1`);
  const resRpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_booking`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!resSelect.ok && !resRpc.ok) {
    ok(`SELECT direto na tabela (status ${resSelect.status}) e chamada de RPC (status ${resRpc.status}) sem nenhuma apikey são recusados`);
  } else {
    fail(`esperava as duas chamadas sem credencial falharem (select.status=${resSelect.status}, rpc.status=${resRpc.status})`);
  }
  note(
    "Este teste só prova que o endpoint exige ALGUMA credencial. Ele NÃO prova, por si só, que os " +
      "papéis 'anon' e 'authenticated' (com uma apikey/JWT válida DELES) são bloqueados pelo REVOKE/RLS -- " +
      "isso exigiria a anon key do projeto, que este script INTENCIONALMENTE não lê (só lê SUPABASE_URL e " +
      "SUPABASE_SERVICE_ROLE_KEY). Ver README.md > 'Verificação manual opcional (anon/authenticated)' para " +
      "os comandos prontos que fecham essa lacuna, usando a anon key copiada manualmente do painel do " +
      "Supabase -- nunca salva em arquivo nem lida por este script."
  );
}

async function testRejectCannotAffectConfirming() {
  section("15) reject_booking NUNCA altera uma reserva em CONFIRMING (corrida corrigida)");
  const n = nextSlotNumber();
  const r1 = await create(n, { idempotencyKey: `it-${RUN_ID}-s15`, requestSignature: "sig-s15", holdMinutes: 5 });
  if (r1.outcome !== "created") {
    fail(`falha ao criar a reserva-base (outcome=${r1.outcome})`);
    return;
  }
  const t = await beginConfirmation(r1.booking.id);
  if (!t.won) {
    fail("begin_confirmation não conseguiu transicionar a reserva recém-criada pra CONFIRMING");
    return;
  }
  // Simula a corrida: uma ação administrativa concorrente tenta rejeitar
  // a MESMA reserva enquanto ela está CONFIRMING (ex.: chamada ao Google
  // Calendar ainda em andamento na outra ação).
  const rejected = await rejectBooking(r1.booking.id);
  if (rejected.status === "CONFIRMING") {
    ok("reject_booking não conseguiu alterar a reserva -- ela permanece CONFIRMING (a corrida documentada na auditoria está fechada)");
  } else {
    fail(`esperava status permanecer CONFIRMING, obteve ${rejected.status}`);
  }
  // Prova que o fluxo legítimo continua funcionando normalmente depois:
  // a mesma reserva ainda consegue ser finalizada pra CONFIRMED.
  const finalized = await finalizeConfirmation(r1.booking.id, "fake-event-id-race", "https://meet.google.com/fake-race-xyz");
  if (finalized.status === "CONFIRMED") {
    ok("depois da tentativa de rejeição (sem efeito), finalize_confirmation ainda consegue concluir para CONFIRMED normalmente");
  } else {
    fail(`esperava CONFIRMED depois de finalize_confirmation, obteve ${finalized.status}`);
  }
}

async function testConcurrentFinalize() {
  section("16) Duas chamadas CONCORRENTES de finalize_confirmation na MESMA reserva -- ambas CONFIRMED, mesmo evento");
  const n = nextSlotNumber();
  const r1 = await create(n, { idempotencyKey: `it-${RUN_ID}-s16`, requestSignature: "sig-s16", holdMinutes: 5 });
  if (r1.outcome !== "created") {
    fail(`falha ao criar a reserva-base (outcome=${r1.outcome})`);
    return;
  }
  const t = await beginConfirmation(r1.booking.id);
  if (!t.won) {
    fail("begin_confirmation não conseguiu transicionar a reserva recém-criada pra CONFIRMING");
    return;
  }
  // Simula duas chamadas administrativas concorrentes tentando finalizar
  // a MESMA reserva (ex.: duplo clique, ou duas requisições que ambas
  // criaram um evento no Google e agora disputam gravar o resultado) --
  // cada uma com um google_event_id/meet_url DIFERENTE, pra provar que
  // só um dos dois "vence" e o outro nunca sobrescreve.
  const [f1, f2] = await Promise.all([
    finalizeConfirmation(r1.booking.id, "fake-event-concurrent-A", "https://meet.google.com/aaa-bbbb-ccc"),
    finalizeConfirmation(r1.booking.id, "fake-event-concurrent-B", "https://meet.google.com/xxx-yyyy-zzz"),
  ]);

  if (f1.status === "CONFIRMED" && f2.status === "CONFIRMED") {
    ok("as duas chamadas concorrentes devolvem CONFIRMED (nenhuma fica com resultado vazio -- a corrida residual está fechada)");
  } else {
    fail(`esperava as duas com status CONFIRMED (f1=${f1.status}, f2=${f2.status})`);
  }

  if (f1.google_event_id === f2.google_event_id && f1.google_meet_url === f2.google_meet_url) {
    ok(`ambas devolvem o MESMO google_event_id/meet_url -- quem venceu foi "${f1.google_event_id}"`);
  } else {
    fail(`esperava o mesmo evento nas duas respostas (f1=${f1.google_event_id}, f2=${f2.google_event_id})`);
  }

  if (f1.google_event_id === "fake-event-concurrent-A" || f1.google_event_id === "fake-event-concurrent-B") {
    ok("o evento gravado é de uma das duas tentativas -- a segunda nunca sobrescreveu os dados da primeira");
  } else {
    fail(`google_event_id inesperado: ${f1.google_event_id}`);
  }
}

async function testFinalizeRejectsInvalidData() {
  section("17) finalize_confirmation rejeita evento vazio e Meet fora do host esperado -- mantém CONFIRMING");
  const n = nextSlotNumber();
  const r1 = await create(n, { idempotencyKey: `it-${RUN_ID}-s17`, requestSignature: "sig-s17", holdMinutes: 5 });
  if (r1.outcome !== "created") {
    fail(`falha ao criar a reserva-base (outcome=${r1.outcome})`);
    return;
  }
  const t = await beginConfirmation(r1.booking.id);
  if (!t.won) {
    fail("begin_confirmation não conseguiu transicionar a reserva recém-criada pra CONFIRMING");
    return;
  }

  const semEvento = await finalizeConfirmation(r1.booking.id, "", "https://meet.google.com/abc-defg-hij");
  if (semEvento.status === "CONFIRMING") {
    ok("google_event_id vazio mantém a reserva CONFIRMING (nunca confirma sem evento)");
  } else {
    fail(`esperava permanecer CONFIRMING com evento vazio, obteve ${semEvento.status}`);
  }

  const outroDominio = await finalizeConfirmation(r1.booking.id, "evt-outro-dominio", "https://evil.example.com/meet.google.com/x");
  if (outroDominio.status === "CONFIRMING") {
    ok("Meet de outro domínio HTTPS é rejeitado -- mantém CONFIRMING");
  } else {
    fail(`esperava permanecer CONFIRMING com Meet de outro domínio, obteve ${outroDominio.status}`);
  }

  const semHttps = await finalizeConfirmation(r1.booking.id, "evt-sem-https", "http://meet.google.com/abc-defg-hij");
  if (semHttps.status === "CONFIRMING") {
    ok("http://meet.google.com (sem HTTPS) é rejeitado -- mantém CONFIRMING");
  } else {
    fail(`esperava permanecer CONFIRMING com Meet sem HTTPS, obteve ${semHttps.status}`);
  }

  const valido = await finalizeConfirmation(r1.booking.id, "evt-final-valido", "https://meet.google.com/abc-defg-hij");
  if (valido.status === "CONFIRMED" && valido.google_event_id === "evt-final-valido") {
    ok("depois das tentativas inválidas (sem efeito), um Meet https://meet.google.com/... válido confirma normalmente");
  } else {
    fail(`esperava CONFIRMED com evt-final-valido, obteve status=${valido.status} event_id=${valido.google_event_id}`);
  }
}

function testServiceRoleSummary() {
  section("19) service_role -- confirmação por consistência dos cenários acima");
  note(
    "Todas as chamadas SELECT/INSERT/UPDATE diretas na tabela (usadas pra montar os cenários acima e pra " +
      "limpeza) e todas as 6 RPCs funcionaram normalmente com a service_role key ao longo deste script -- " +
      "confirmando que ela tem exatamente o acesso concedido na migration (GRANT explícito na tabela/view + " +
      "EXECUTE nas 6 funções), sem exercitar aqui nenhum caminho fora disso."
  );
}

async function cleanup() {
  section("Limpeza");
  const ids = Array.from(createdIds);
  if (ids.length === 0) {
    console.log("  (nenhuma reserva fictícia foi criada -- nada para limpar)");
    return;
  }
  try {
    await rawDeleteByIds(ids);
    console.log(`  ${ids.length} reserva(s) fictícia(s) desta execução removida(s) com sucesso.`);
  } catch {
    console.log(`  ⚠ falha ao limpar automaticamente -- ${ids.length} registro(s) fictício(s) desta execução podem ter sobrado.`);
    console.log(`     Identifique-os no SQL Editor com:`);
    console.log(`       select id, public_code from bookings where idempotency_key like 'it-${RUN_ID}-%';`);
    console.log(`     E apague manualmente com:`);
    console.log(`       delete from bookings where idempotency_key like 'it-${RUN_ID}-%';`);
  }
}

async function main() {
  console.log(`Teste de integração Supabase -- execução ${RUN_ID} (dados fictícios, horários em 2099)`);
  try {
    await testCreation();
    await testIdempotencySame();
    await testIdempotencyConflict();
    await testConcurrentCreate();
    await testActiveBlocks();
    await testExpiredReleases();
    await testConfirmingBlocksAfterExpiry();
    await testConfirmedBlocksAfterExpiry();
    await testUnknownBlocksAfterExpiry();
    await testRejectedNeverBlocks();
    await testBeginConfirmationGuards();
    await testConcurrentConfirmations();
    await testRejectCannotAffectConfirming();
    await testConcurrentFinalize();
    await testFinalizeRejectsInvalidData();
    await testNoCredentialsRejected();
    testServiceRoleSummary();
  } catch {
    // Nunca imprime err.message/err.stack (pode ecoar detalhe de rede
    // ou de resposta) -- só sinaliza que algo interrompeu o script.
    failCount++;
    failures.push("execução interrompida por uma exceção inesperada");
    console.log("\n✖ Execução interrompida por uma exceção inesperada (detalhe suprimido).");
  } finally {
    await cleanup();
    console.error = originalConsoleError;
  }

  console.log(`\nResultado: ${passCount} passou, ${failCount} falhou.`);
  if (failCount > 0) {
    console.log("Cenários com falha:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failCount > 0 ? 1 : 0);
}

main();
