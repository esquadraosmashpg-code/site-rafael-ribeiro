// Verificações estruturais (leitura de código-fonte) das rotas novas de
// reserva/admin -- não importa os route.js (importam "next/server", que só
// resolve dentro do bundler do Next, não em `node --test` puro; ver
// tests/oauthAdminRoutes.test.js pro mesmo padrão já usado no projeto).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function src(relPath) {
  return readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

const reservar = src("app/api/agendar/reservar/route.js");
const status = src("app/api/agendar/reserva/[codigo]/status/route.js");
const adminList = src("app/api/admin/agendamentos/route.js");
const adminConfirmar = src("app/api/admin/agendamentos/[id]/confirmar/route.js");
const adminRejeitar = src("app/api/admin/agendamentos/[id]/rejeitar/route.js");
const adminLogin = src("app/api/admin/agendamentos/login/route.js");
const adminLogout = src("app/api/admin/agendamentos/logout/route.js");

describe("POST /api/agendar/reservar -- nunca loga PII", () => {
  test("nenhuma chamada a console.* interpola nome/e-mail/whatsapp/payload cru", () => {
    const linhasDeLog = reservar.match(/console\.(log|warn|error|info|debug)\([^)]*\)/g) || [];
    assert.ok(linhasDeLog.length > 0, "esperado pelo menos um console.error de erro técnico");
    for (const linha of linhasDeLog) {
      assert.ok(!/value\.(nome|email|whatsapp)/.test(linha), `log vazando PII: ${linha}`);
      assert.ok(!/\bpayload\b/.test(linha), `log vazando payload cru: ${linha}`);
    }
  });

  test("reutiliza as guardas HTTP e o rate limit já existentes (nunca reimplementa)", () => {
    assert.match(reservar, /isAllowedOrigin/);
    assert.match(reservar, /hasJsonContentType/);
    assert.match(reservar, /readBodyWithLimit/);
    assert.match(reservar, /isRateLimited/);
  });

  test("nunca confirma nem cria evento no Google Calendar -- só cria reserva provisória", () => {
    assert.ok(!/createCalendarEvent/.test(reservar), "reservar não deveria criar evento no Google Calendar");
    assert.match(reservar, /PENDING_PAYMENT|createBooking/);
  });

  test("sem Supabase configurado, nunca finge sucesso (responde erro, nunca 200 fake)", () => {
    assert.match(reservar, /isSupabaseConfigured/);
    assert.match(reservar, /503/);
  });
});

describe("GET /api/agendar/reserva/[codigo]/status -- rota pública sem PII", () => {
  test("nunca referencia campos de PII do paciente", () => {
    for (const campo of ["patient_name", "patient_email", "patient_phone"]) {
      assert.ok(!status.includes(campo), `rota pública de status não deveria referenciar ${campo}`);
    }
  });

  test("só devolve o link do Meet quando o status já é CONFIRMED", () => {
    assert.match(status, /BookingStatus\.CONFIRMED/);
    assert.match(status, /meetLink:\s*status === BookingStatus\.CONFIRMED/);
  });

  test("resposta é sempre no-store", () => {
    assert.match(status, /Cache-Control["']?:\s*["']no-store["']/);
  });
});

describe("Rotas /api/admin/agendamentos/* -- sessão obrigatória", () => {
  for (const [nome, codigo] of [
    ["listagem", adminList],
    ["confirmar", adminConfirmar],
    ["rejeitar", adminRejeitar],
  ]) {
    test(`${nome}: chama hasValidAdminSession e responde 401 quando falha`, () => {
      assert.match(codigo, /hasValidAdminSession\(request\)/);
      assert.match(codigo, /401/);
    });

    test(`${nome}: respostas marcadas no-store e X-Robots-Tag noindex`, () => {
      assert.match(codigo, /Cache-Control["']?:\s*["']no-store["']/);
      assert.match(codigo, /X-Robots-Tag["']?:\s*["']noindex, nofollow, noarchive["']/);
    });
  }

  test("confirmar: nunca escreve valor/sinal no evento do Google Calendar", () => {
    const trechoDescricao = adminConfirmar.slice(
      adminConfirmar.indexOf("createCalendarEvent"),
      adminConfirmar.indexOf("createCalendarEvent") + 800
    );
    assert.ok(!/R\$/.test(trechoDescricao), "descrição do evento não deveria conter valores financeiros");
  });

  test("confirmar: idempotente -- repetir numa reserva já CONFIRMED devolve o mesmo resultado sem novo evento", () => {
    assert.match(adminConfirmar, /booking\.status === BookingStatus\.CONFIRMED/);
  });

  test("confirmar: transição atômica via beginConfirmation antes de qualquer chamada ao Google", () => {
    const idxBegin = adminConfirmar.indexOf("beginConfirmation");
    const idxCreate = adminConfirmar.indexOf("createCalendarEvent");
    assert.ok(idxBegin > -1 && idxCreate > -1 && idxBegin < idxCreate);
  });

  test("confirmar: falha ambígua na escrita do Google marca UNKNOWN, nunca repete sozinho", () => {
    assert.match(adminConfirmar, /markUnknown/);
  });
});

describe("Login/logout admin -- cookie seguro, nunca vaza a senha", () => {
  test("login nunca devolve a senha em nenhuma resposta", () => {
    assert.ok(!/senha:\s*senha/.test(adminLogin));
    const bodiesDeResposta = adminLogin.match(/jsonNoStore\(\{[^}]*\}/g) || [];
    for (const body of bodiesDeResposta) {
      assert.ok(!/\bsenha\b/.test(body), `resposta do login não deveria incluir a senha: ${body}`);
    }
  });

  test("cookie de sessão: HttpOnly, SameSite=Strict, Secure condicional à produção", () => {
    assert.match(adminLogin, /httpOnly:\s*true/);
    assert.match(adminLogin, /sameSite:\s*["']strict["']/);
    assert.match(adminLogin, /secure:\s*process\.env\.NODE_ENV === ["']production["']/);
  });

  test("login tem rate limit próprio, mais apertado que as rotas públicas", () => {
    assert.match(adminLogin, /isRateLimited/);
    assert.match(adminLogin, /max:\s*5/);
  });

  test("logout limpa o cookie (maxAge 0) com as mesmas flags de segurança", () => {
    assert.match(adminLogout, /maxAge:\s*0/);
    assert.match(adminLogout, /httpOnly:\s*true/);
    assert.match(adminLogout, /sameSite:\s*["']strict["']/);
  });
});

describe("Login admin -- recusa uniforme (sem oráculo de senha/config/bloqueio/limite persistente)", () => {
  test("existe uma única mensagem genérica de recusa, reaproveitada (nunca mensagens diferentes por motivo)", () => {
    assert.match(adminLogin, /GENERIC_DENY_MESSAGE\s*=\s*"Não foi possível entrar\. Verifique os dados ou tente novamente mais tarde\."/);
    const usos = (adminLogin.match(/GENERIC_DENY_MESSAGE/g) || []).length;
    assert.ok(usos >= 2, "a constante deveria ser declarada e depois reaproveitada, não redigitada em cada caminho");
  });

  test("todo caminho de recusa (rate limit em memória, config ausente, attempt_key ausente, erro no limite persistente, bloqueado, senha errada) chama denyUniformly(startedAt)", () => {
    const ocorrencias = (adminLogin.match(/return denyUniformly\(startedAt\);/g) || []).length;
    assert.equal(
      ocorrencias,
      6,
      `esperava exatamente 6 caminhos usando denyUniformly(startedAt), achou ${ocorrencias}`
    );
  });

  test("startedAt é capturado no início do handler, antes de qualquer guarda", () => {
    const idxHandler = adminLogin.indexOf("export async function POST(request) {");
    const idxStartedAt = adminLogin.indexOf("const startedAt = Date.now();");
    const idxPrimeiraGuarda = adminLogin.indexOf("isAllowedOrigin(request)");
    assert.ok(idxHandler > -1 && idxStartedAt > idxHandler, "startedAt precisa existir dentro do handler");
    assert.ok(idxStartedAt < idxPrimeiraGuarda, "startedAt precisa ser capturado ANTES de qualquer guarda/decisão");
  });

  test("denyUniformly mede o tempo já decorrido desde startedAt e só espera o restante até o piso mínimo (não um sleep fixo pós-processamento)", () => {
    const fnStart = adminLogin.indexOf("async function denyUniformly(startedAt)");
    const fnBody = adminLogin.slice(fnStart, fnStart + 400);
    assert.match(fnBody, /Date\.now\(\)\s*-\s*startedAt/, "precisa calcular o tempo decorrido a partir do início da requisição");
    assert.match(fnBody, /MIN_TOTAL_RESPONSE_MS\s*-\s*elapsed/, "precisa esperar só o restante até o piso, não um valor fixo");
    const sleepIdx = fnBody.indexOf("await sleep(");
    const returnIdx = fnBody.indexOf("return jsonNoStore(");
    assert.ok(sleepIdx > -1 && returnIdx > sleepIdx, "a espera precisa acontecer ANTES de montar a resposta");
  });

  test("todos os caminhos de recusa uniformizada respondem exatamente 401 (nunca 429/503/401 diferenciáveis)", () => {
    const fnStart = adminLogin.indexOf("async function denyUniformly(startedAt)");
    const fnBody = adminLogin.slice(fnStart, fnStart + 400);
    assert.match(fnBody, /status:\s*401/);
    // Garante que NENHUM gatilho monta sua PRÓPRIA resposta com status
    // diferente -- todos delegam pra denyUniformly() em vez de
    // `return jsonNoStore(..., {status: X})` direto.
    assert.doesNotMatch(adminLogin, /isRateLimited\([\s\S]{0,120}?status:\s*429/);
    assert.doesNotMatch(adminLogin, /isAdminAuthConfigured\(\)[\s\S]{0,120}?status:\s*503/);
  });

  test("consome o limite persistente ANTES de comparar a senha, e nunca consome de novo se a senha estiver errada", () => {
    const idxConsume = adminLogin.indexOf("consumeAdminLoginAttempt(attemptKey)");
    const idxVerify = adminLogin.indexOf("verifyAdminPassword(senha)");
    assert.ok(idxConsume > -1 && idxVerify > -1 && idxConsume < idxVerify, "o consumo precisa acontecer antes da comparação de senha");
    // Só deve existir UMA chamada a consumeAdminLoginAttempt em todo o
    // arquivo -- se houvesse uma segunda (ex.: também no caminho de
    // senha errada), a mesma tentativa seria contada duas vezes.
    const chamadasConsume = (adminLogin.match(/consumeAdminLoginAttempt\(/g) || []).length;
    assert.equal(chamadasConsume, 1, `esperava exatamente 1 chamada a consumeAdminLoginAttempt, achou ${chamadasConsume}`);
  });

  test("reseta o limite persistente só depois de senha correta (registerAdminLoginSuccess depois de verifyAdminPassword)", () => {
    const idxVerify = adminLogin.indexOf("verifyAdminPassword(senha)");
    const idxRegisterSuccess = adminLogin.indexOf("registerAdminLoginSuccess(attemptKey)");
    assert.ok(idxRegisterSuccess > idxVerify, "o reset só deveria acontecer depois da verificação de senha, no caminho de sucesso");
  });

  test("erro ao consultar o limite persistente é tratado como recusa (falha fechada), nunca como sucesso", () => {
    assert.match(adminLogin, /catch\s*\(err\)\s*{\s*\n\s*console\.error\("\[admin-login\] erro ao consultar limite de tentativas:", err\.message\);\s*\n\s*return denyUniformly\(startedAt\);/);
  });

  test("nunca loga a senha, o corpo da requisição, o cookie gerado, o IP ou a attempt_key", () => {
    assert.doesNotMatch(adminLogin, /console\.(log|warn|error|info|debug)\([^)]*senha/i);
    assert.doesNotMatch(adminLogin, /console\.(log|warn|error|info|debug)\([^)]*token/i);
    assert.doesNotMatch(adminLogin, /console\.(log|warn|error|info|debug)\([^)]*payload/i);
    assert.doesNotMatch(adminLogin, /console\.(log|warn|error|info|debug)\([^)]*attemptKey/i);
    assert.doesNotMatch(adminLogin, /console\.(log|warn|error|info|debug)\([^)]*(ip|Ip)\b/);
  });
});

function makeRequest(headerEntries = []) {
  const request = { headers: new Map(headerEntries) };
  request.headers.get = Map.prototype.get.bind(request.headers);
  return request;
}

// Roda `fn` com NODE_ENV temporariamente ajustado, restaurando o valor
// original (mesmo que ausente) ao final -- inclusive em caso de exceção.
async function withNodeEnv(value, fn) {
  const original = process.env.NODE_ENV;
  try {
    if (value === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = value;
    return await fn();
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
}

describe("lib/admin/clientIp.js -- identificador restrito por ambiente (sem fallback em produção)", () => {
  test("produção: usa exclusivamente x-vercel-forwarded-for quando presente e válido", async () => {
    const { getAdminLoginIdentifier } = await import("../lib/admin/clientIp.js");
    await withNodeEnv("production", () => {
      const request = makeRequest([["x-vercel-forwarded-for", "203.0.113.9"]]);
      assert.equal(getAdminLoginIdentifier(request), "203.0.113.9");
    });
  });

  test("produção: sem x-vercel-forwarded-for, cai no balde fixo 'unknown-production' (nunca trava, nunca inventa um IP)", async () => {
    const { getAdminLoginIdentifier } = await import("../lib/admin/clientIp.js");
    await withNodeEnv("production", () => {
      const request = makeRequest([]);
      assert.equal(getAdminLoginIdentifier(request), "unknown-production");
    });
  });

  test("produção: x-forwarded-for forjado, SEM x-vercel-forwarded-for, é ignorado -- cai no balde fixo, nunca usa o cabeçalho falso", async () => {
    const { getAdminLoginIdentifier } = await import("../lib/admin/clientIp.js");
    await withNodeEnv("production", () => {
      const request = makeRequest([["x-forwarded-for", "9.9.9.9"]]);
      assert.equal(getAdminLoginIdentifier(request), "unknown-production");
    });
  });

  test("produção: com os dois cabeçalhos presentes, x-vercel-forwarded-for tem prioridade EXCLUSIVA (x-forwarded-for nunca influencia o resultado)", async () => {
    const { getAdminLoginIdentifier } = await import("../lib/admin/clientIp.js");
    await withNodeEnv("production", () => {
      const request = makeRequest([
        ["x-vercel-forwarded-for", "203.0.113.9"],
        ["x-forwarded-for", "9.9.9.9, 8.8.8.8"],
      ]);
      assert.equal(getAdminLoginIdentifier(request), "203.0.113.9");
    });
  });

  test("desenvolvimento local: sempre 'local-development', mesmo com cabeçalhos de IP presentes (nunca depende do que o navegador manda)", async () => {
    const { getAdminLoginIdentifier } = await import("../lib/admin/clientIp.js");
    await withNodeEnv("development", () => {
      const request = makeRequest([
        ["x-vercel-forwarded-for", "203.0.113.9"],
        ["x-forwarded-for", "9.9.9.9"],
      ]);
      assert.equal(getAdminLoginIdentifier(request), "local-development");
    });
    await withNodeEnv("test", () => {
      assert.equal(getAdminLoginIdentifier(makeRequest([])), "local-development");
    });
    await withNodeEnv(undefined, () => {
      assert.equal(getAdminLoginIdentifier(makeRequest([])), "local-development");
    });
  });

  test("normalizeIp: remove porta em IPv4", async () => {
    const { normalizeIp } = await import("../lib/admin/clientIp.js");
    assert.equal(normalizeIp("203.0.113.9:54321"), "203.0.113.9");
  });

  test("normalizeIp: IPv6 puro passa sem alteração (além de minúsculas)", async () => {
    const { normalizeIp } = await import("../lib/admin/clientIp.js");
    assert.equal(normalizeIp("2001:DB8::1"), "2001:db8::1");
  });

  test("normalizeIp: remove colchetes e porta em IPv6", async () => {
    const { normalizeIp } = await import("../lib/admin/clientIp.js");
    assert.equal(normalizeIp("[2001:db8::1]:54321"), "2001:db8::1");
  });

  test("normalizeIp: IPv4-mapeado-em-IPv6 vira a forma IPv4 pura", async () => {
    const { normalizeIp } = await import("../lib/admin/clientIp.js");
    assert.equal(normalizeIp("::FFFF:203.0.113.9"), "203.0.113.9");
  });

  test("normalizeIp: vazio devolve 'unknown', nunca lança", async () => {
    const { normalizeIp } = await import("../lib/admin/clientIp.js");
    assert.equal(normalizeIp(""), "unknown");
    assert.equal(normalizeIp(null), "unknown");
  });
});

describe("lib/admin/loginAttemptKey.js -- HMAC, não hash simples", () => {
  test("sem BOOKING_ADMIN_SESSION_SECRET configurado (ou curto demais), devolve null -- nunca calcula com uma chave fraca", async () => {
    const original = process.env.BOOKING_ADMIN_SESSION_SECRET;
    try {
      delete process.env.BOOKING_ADMIN_SESSION_SECRET;
      const { computeAdminLoginAttemptKey } = await import("../lib/admin/loginAttemptKey.js");
      assert.equal(computeAdminLoginAttemptKey(makeRequest([])), null);
    } finally {
      if (original !== undefined) process.env.BOOKING_ADMIN_SESSION_SECRET = original;
    }
  });

  test("mesmo identificador + mesmo segredo produz a MESMA chave; segredos diferentes produzem chaves diferentes (prova de que é HMAC keyed, não um hash simples do IP)", async () => {
    const { computeAdminLoginAttemptKey } = await import("../lib/admin/loginAttemptKey.js");
    const original = process.env.BOOKING_ADMIN_SESSION_SECRET;
    try {
      await withNodeEnv("production", async () => {
        const request = () => makeRequest([["x-vercel-forwarded-for", "203.0.113.9"]]);

        process.env.BOOKING_ADMIN_SESSION_SECRET = "a".repeat(64);
        const chave1 = computeAdminLoginAttemptKey(request());
        const chave2 = computeAdminLoginAttemptKey(request());
        assert.equal(chave1, chave2, "o mesmo identificador com o mesmo segredo deveria produzir a mesma chave");
        assert.match(chave1, /^[0-9a-f]{64}$/, "esperava um HMAC-SHA-256 em hex (64 caracteres)");

        process.env.BOOKING_ADMIN_SESSION_SECRET = "b".repeat(64);
        const chave3 = computeAdminLoginAttemptKey(request());
        assert.notEqual(chave1, chave3, "segredos diferentes deveriam produzir chaves diferentes pro MESMO identificador");
      });
    } finally {
      if (original !== undefined) process.env.BOOKING_ADMIN_SESSION_SECRET = original;
      else delete process.env.BOOKING_ADMIN_SESSION_SECRET;
    }
  });

  test("em dev local, o identificador (e portanto a chave) não muda mesmo variando o IP declarado nos cabeçalhos", async () => {
    const { computeAdminLoginAttemptKey } = await import("../lib/admin/loginAttemptKey.js");
    const original = process.env.BOOKING_ADMIN_SESSION_SECRET;
    try {
      process.env.BOOKING_ADMIN_SESSION_SECRET = "c".repeat(64);
      await withNodeEnv("development", () => {
        const chaveA = computeAdminLoginAttemptKey(makeRequest([["x-vercel-forwarded-for", "1.1.1.1"]]));
        const chaveB = computeAdminLoginAttemptKey(makeRequest([["x-vercel-forwarded-for", "2.2.2.2"]]));
        assert.equal(chaveA, chaveB, "em dev local, o identificador é sempre 'local-development', independente do cabeçalho");
      });
    } finally {
      if (original !== undefined) process.env.BOOKING_ADMIN_SESSION_SECRET = original;
      else delete process.env.BOOKING_ADMIN_SESSION_SECRET;
    }
  });
});
