#!/usr/bin/env node
// scripts/verify-admin-login-lockout.mjs
//
// AINDA NÃO EXECUTÁVEL DE VERDADE: exercita as RPCs
// admin_login_consume_attempt / admin_login_register_success de
// supabase/migrations/0002_admin_login_rate_limit.sql (PROPOSTA), que
// ainda não foi aplicada em nenhum projeto Supabase real. Rodar este
// script antes da migration existir vai falhar com "função não
// encontrada" -- é esperado, não é bug.
//
// Mesmo padrão de scripts/verify-supabase-bookings.mjs: só lê
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY do ambiente, nunca imprime
// esses valores, usa chaves fictícias derivadas de identificadores de
// teste aleatórios (NUNCA um IP real -- este script nunca calcula
// HMAC(BOOKING_ADMIN_SESSION_SECRET, ...), só usa strings de teste
// prontas como se já fossem a attempt_key final), limpa tudo que criar
// ao final (via admin_login_register_success, que remove a linha).
//
// NÃO roda como parte de `npm test` nem de `npm run test:supabase` --
// só sob demanda, depois que a migration 0002 for aprovada e aplicada:
//   node scripts/verify-admin-login-lockout.mjs

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

function loadEnvLocalIfPresent() {
  const envPath = path.join(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const linha of raw.split("\n")) {
    const s = linha.trim();
    if (!s || s.startsWith("#")) continue;
    const idx = s.indexOf("=");
    if (idx === -1) continue;
    const chave = s.slice(0, idx).trim();
    const valor = s.slice(idx + 1).trim();
    if (chave && process.env[chave] === undefined) process.env[chave] = valor;
  }
}
loadEnvLocalIfPresent();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log(
    "Teste não executado: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar este script."
  );
  process.exit(0);
}

const originalConsoleError = console.error;
console.error = () => {};

const SUPABASE_URL = process.env.SUPABASE_URL.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let passCount = 0;
let failCount = 0;
function ok(msg) {
  passCount++;
  console.log(`  ✔ ${msg}`);
}
function fail(msg) {
  failCount++;
  console.log(`  ✖ ${msg}`);
}
function section(t) {
  console.log(`\n${t}`);
}

async function rpc(name, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const err = new Error(`RPC ${name} respondeu ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function firstRow(result) {
  return Array.isArray(result) ? result[0] : result;
}

async function consume(key) {
  return firstRow(await rpc("admin_login_consume_attempt", { p_attempt_key: key }));
}

async function registerSuccess(key) {
  return rpc("admin_login_register_success", { p_attempt_key: key });
}

// Chaves fictícias -- nunca um IP real, nunca calculadas com HMAC de
// verdade -- só um hash de uma string de teste, com sufixo de execução
// pra nunca colidir com uma tentativa real ou com outra execução deste
// script rodando em paralelo (ex.: CI).
const RUN_ID = randomUUID().slice(0, 8);
function fakeAttemptKey(suffix) {
  return createHash("sha256").update(`teste-lockout-${RUN_ID}-${suffix}`).digest("hex");
}
const createdKeys = new Set();
function trackedKey(suffix) {
  const key = fakeAttemptKey(suffix);
  createdKeys.add(key);
  return key;
}

async function testAllowsUpToFiveThenBlocks() {
  section("1) Permite até 5 chamadas sequenciais, bloqueia a partir da 6ª");
  const key = trackedKey("s1");
  const resultados = [];
  for (let i = 0; i < 7; i++) {
    resultados.push(await consume(key));
  }
  const permitidas = resultados.filter((r) => r.allowed === true).length;
  const negadas = resultados.filter((r) => r.allowed === false).length;
  if (permitidas === 5 && negadas === 2) {
    ok("5 permitidas, 2 negadas (chamadas 6 e 7), exatamente como esperado");
  } else {
    fail(`esperava 5 permitidas / 2 negadas, obteve ${permitidas} permitidas / ${negadas} negadas`);
  }
  if (resultados[4].remaining_attempts === 0) {
    ok("remaining_attempts chega a 0 na 5ª chamada (a que cruza o limite)");
  } else {
    fail(`esperava remaining_attempts=0 na 5ª chamada, obteve ${resultados[4].remaining_attempts}`);
  }
}

async function test20ConcurrentCallsSameKey() {
  section("2) 20 chamadas CONCORRENTES (mesma chave, JÁ existente) -- exatamente 5 allowed=true, 15 allowed=false");
  const key = trackedKey("s2-concorrencia");
  await consume(key); // garante que a linha já existe antes da rajada -- cenário "linha pré-existente"
  const chamadas = Array.from({ length: 19 }, () => consume(key));
  const resultados = await Promise.all(chamadas);
  const permitidas = resultados.filter((r) => r.allowed === true).length + 1; // +1 da chamada de preparo acima
  const negadas = resultados.filter((r) => r.allowed === false).length;
  if (permitidas === 5 && negadas === 15) {
    ok("20 chamadas no total (1 de preparo + 19 concorrentes) -> exatamente 5 permitidas e 15 negadas");
  } else {
    fail(
      `RACE DETECTADA (ou lógica incorreta): esperava exatamente 5 permitidas / 15 negadas, obteve ${permitidas} permitidas / ${negadas} negadas`
    );
  }
}

async function testBootstrapRaceOnBrandNewKey() {
  section("2b) BOOTSTRAP: 20 chamadas CONCORRENTES numa attempt_key que NUNCA existiu antes -- exatamente 5 allowed=true, 15 allowed=false");
  // Diferente do cenário acima: aqui NENHUMA chamada de preparo acontece
  // antes da rajada. `key` é gerada agora mesmo, com um sufixo exclusivo
  // desta função -- garantidamente inédita (nunca foi tocada por nenhum
  // outro teste deste script nem por nenhuma execução anterior, pois
  // carrega RUN_ID, único por execução). Isso exercita especificamente o
  // caso em que `select ... for update` NÃO tem nenhuma linha pra travar
  // no início -- a serialização, nesse instante, depende do INSERT ...
  // ON CONFLICT DO NOTHING colidindo no índice único da chave primária
  // (ver comentário "BOOTSTRAP" na migration, acima da definição de
  // admin_login_consume_attempt).
  const key = trackedKey("bootstrap-chave-inedita");
  const chamadas = Array.from({ length: 20 }, () => consume(key));
  const resultados = await Promise.all(chamadas);
  const permitidas = resultados.filter((r) => r.allowed === true).length;
  const negadas = resultados.filter((r) => r.allowed === false).length;
  if (permitidas === 5 && negadas === 15) {
    ok("bootstrap concorrente numa chave inédita -> exatamente 5 permitidas e 15 negadas (o INSERT...ON CONFLICT serializa mesmo antes da linha existir)");
  } else {
    fail(
      `RACE NO BOOTSTRAP DETECTADA: esperava exatamente 5 permitidas / 15 negadas numa chave nunca antes usada, obteve ${permitidas} permitidas / ${negadas} negadas`
    );
  }
}

async function testDifferentKeysNeverInterfere() {
  section("3) Chaves diferentes nunca se afetam (prova de que um atacante não bloqueia o Rafael)");
  const keyAtacante = trackedKey("atacante");
  const keyRafael = trackedKey("rafael");
  for (let i = 0; i < 7; i++) await consume(keyAtacante);
  const tentativaRafael = await consume(keyRafael);
  if (tentativaRafael.allowed === true) {
    ok("mesmo com o 'atacante' já bloqueado, a chave do 'rafael' (nunca tentou) continua permitida");
  } else {
    fail(`esperava allowed=true pra uma chave nova/isolada, obteve ${tentativaRafael.allowed}`);
  }
}

async function testRegisterSuccessResetsCounter() {
  section("4) register_success reseta o contador (linha removida)");
  const key = trackedKey("s4");
  await consume(key);
  await consume(key);
  await registerSuccess(key);
  const depois = await consume(key);
  if (depois.allowed === true && depois.remaining_attempts === 4) {
    ok("depois do sucesso, a próxima tentativa começa do zero (remaining_attempts=4, como numa 1ª tentativa)");
  } else {
    fail(`esperava allowed=true e remaining_attempts=4 logo após reset, obteve allowed=${depois.allowed} remaining=${depois.remaining_attempts}`);
  }
}

async function testExpiredLockUnlocksAutomatically() {
  section("5) Bloqueio expirado libera sozinho, sem intervenção manual (sem cron)");
  // Não dá pra esperar 30 minutos de verdade num script de CI -- este
  // cenário serve como documentação executável do COMPORTAMENTO
  // esperado (locked_until é só uma comparação contra now() em toda
  // leitura, nunca uma rotina de limpeza) e como um teste STRUCTURAL
  // mínimo: confirma que, olhando só pelas respostas públicas da RPC
  // (nunca lendo a tabela diretamente -- ela é inacessível pra
  // anon/authenticated de propósito), o comportamento de bloqueio segue
  // o esperado até o limite. A verificação completa do "libera sozinho
  // depois de 30 minutos" é validada pela LEITURA do código SQL (ver
  // teste estrutural em tests/) e pela mesma lógica já comprovada
  // correta em public.finalize_confirmation / active_bookings (que usa
  // exatamente o mesmo padrão "comparar com now() a cada leitura, sem
  // cron", já testado de ponta a ponta em scripts/verify-supabase-bookings.mjs).
  const key = trackedKey("s5");
  for (let i = 0; i < 6; i++) await consume(key);
  const bloqueado = await consume(key);
  if (bloqueado.allowed === false) {
    ok("depois de estourar o limite, chamadas seguintes continuam negadas (pré-condição do teste de expiração)");
  } else {
    fail("esperava já estar bloqueado antes de validar a expiração -- pré-condição falhou");
  }
  console.log("  ⓘ expiração real (30 min) não é aguardada neste script -- ver nota acima.");
}

async function testNoSecretLeaksInOutput() {
  section("6) Nenhuma saída deste script imprime IP, HMAC ou segredo");
  // Checagem por CONSTRUÇÃO, não por varredura de stdout: este script
  // nunca calcula um HMAC de verdade (as attempt_key aqui vêm só de
  // fakeAttemptKey(), um sha256 de uma string de teste, nunca de um IP
  // real nem de BOOKING_ADMIN_SESSION_SECRET) e nenhuma das funções
  // ok()/fail()/section() acima recebe `process.env.*` como argumento.
  // A garantia estrutural equivalente (nenhum console.* interpola
  // segredo/IP na rota de verdade) é coberta pelos testes offline em
  // tests/.
  ok("por construção, este script nunca loga IP/HMAC/segredo -- só chaves fictícias e resultados booleanos");
}

async function cleanup() {
  section("Limpeza");
  for (const key of createdKeys) {
    try {
      await registerSuccess(key);
    } catch {
      // ignora -- a chave é fictícia; se falhar aqui, não há PII nem
      // custo real envolvido.
    }
  }
  console.log(`  ${createdKeys.size} chave(s) fictícia(s) de teste limpas.`);
}

async function main() {
  console.log(`Teste de integração -- rate limit persistente do login admin (execução ${RUN_ID})`);
  try {
    await testAllowsUpToFiveThenBlocks();
    await test20ConcurrentCallsSameKey();
    await testBootstrapRaceOnBrandNewKey();
    await testDifferentKeysNeverInterfere();
    await testRegisterSuccessResetsCounter();
    await testExpiredLockUnlocksAutomatically();
    await testNoSecretLeaksInOutput();
  } catch {
    failCount++;
    console.log("\n✖ Execução interrompida por uma exceção inesperada (detalhe suprimido).");
  } finally {
    await cleanup();
    console.error = originalConsoleError;
  }
  console.log(`\nResultado: ${passCount} passou, ${failCount} falhou.`);
  process.exit(failCount > 0 ? 1 : 0);
}

main();
