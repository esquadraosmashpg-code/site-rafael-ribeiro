// Verificações estruturais (leitura de texto SQL) da migration 0002
// (PROPOSTA -- ainda não aplicada em nenhum Supabase real). Mesmo padrão
// de tests/auditCorrections.test.js: não roda SQL nenhum, só confirma
// que o arquivo tem a forma esperada.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "0002_admin_login_rate_limit.sql"),
  "utf8"
);

describe("Migration 0002 -- RPC atômica única (sem TOCTOU)", () => {
  test("as duas funções antigas (is_locked / register_failure) NÃO são mais definidas -- só citadas em comentário explicando a revisão", () => {
    assert.ok(
      !/create or replace function public\.admin_login_is_locked/.test(migration),
      "admin_login_is_locked não deveria mais ser definida como função"
    );
    assert.ok(
      !/create or replace function public\.admin_login_register_failure/.test(migration),
      "admin_login_register_failure não deveria mais ser definida como função"
    );
  });

  test("existe uma única função admin_login_consume_attempt, retornando (allowed, remaining_attempts)", () => {
    assert.match(migration, /create or replace function public\.admin_login_consume_attempt\(p_attempt_key text\)/);
    assert.match(migration, /returns table\(allowed boolean, remaining_attempts integer\)/);
  });

  test("usa SELECT ... FOR UPDATE para travar a linha antes de decidir (fecha a janela TOCTOU)", () => {
    const fnStart = migration.indexOf("create or replace function public.admin_login_consume_attempt");
    const fnEnd = migration.indexOf("$$;", fnStart);
    const fnBody = migration.slice(fnStart, fnEnd);
    assert.match(fnBody, /for update/i, "precisa travar a linha com FOR UPDATE antes de ler o estado atual");
    // A leitura com FOR UPDATE precisa vir ANTES de qualquer UPDATE que
    // decida o novo estado -- senão o lock não protege a decisão.
    const idxSelectForUpdate = fnBody.search(/select \* into v_row[\s\S]*?for update/i);
    const idxPrimeiroUpdateDecisorio = fnBody.indexOf("set attempt_count = v_new_count");
    assert.ok(idxSelectForUpdate > -1, "esperava um SELECT ... FOR UPDATE lendo o estado atual pra v_row");
    assert.ok(
      idxPrimeiroUpdateDecisorio === -1 || idxSelectForUpdate < idxPrimeiroUpdateDecisorio,
      "o lock (FOR UPDATE) precisa vir antes do UPDATE que decide o novo attempt_count/locked_until"
    );
  });

  test("a própria função decide allowed=true/false -- não delega a decisão a uma segunda chamada externa", () => {
    const fnStart = migration.indexOf("create or replace function public.admin_login_consume_attempt");
    const fnEnd = migration.indexOf("$$;", fnStart);
    const fnBody = migration.slice(fnStart, fnEnd);
    // allowed é atribuído dentro da própria função, tanto no caminho de
    // bloqueio (false) quanto no caminho de sucesso (true) -- nunca lido
    // de uma tabela por um caller externo antes de decidir.
    const atribuicoes = (fnBody.match(/allowed\s*:=\s*(true|false)/g) || []).length;
    assert.ok(atribuicoes >= 2, `esperava allowed ser atribuído nos dois caminhos (bloqueado/permitido) dentro da mesma função, achou ${atribuicoes} atribuições`);
  });

  test("quando já bloqueado, recusa sem incrementar o contador de novo", () => {
    const fnStart = migration.indexOf("create or replace function public.admin_login_consume_attempt");
    const fnEnd = migration.indexOf("$$;", fnStart);
    const fnBody = migration.slice(fnStart, fnEnd);
    const idxBloqueado = fnBody.indexOf("v_row.locked_until is not null and v_row.locked_until > now()");
    assert.ok(idxBloqueado > -1, "esperava uma checagem explícita de 'já bloqueado agora'");
    const trechoBloqueado = fnBody.slice(idxBloqueado, idxBloqueado + 400);
    assert.doesNotMatch(trechoBloqueado, /attempt_count\s*=\s*v_new_count/, "o caminho de 'já bloqueado' não deveria reatribuir attempt_count");
    assert.match(trechoBloqueado, /allowed\s*:=\s*false/);
  });

  test("define locked_until = now() + 30 minutos só quando o contador atinge 5", () => {
    assert.match(migration, /if v_new_count >= 5 then\s*\n\s*v_new_locked_until := now\(\) \+ interval '30 minutes';/);
  });

  test("register_success continua existindo e removendo a linha (reset completo)", () => {
    assert.match(migration, /create or replace function public\.admin_login_register_success\(p_attempt_key text\)/);
    assert.match(migration, /delete from public\.admin_login_attempts where attempt_key = p_attempt_key;/);
  });
});

describe("Migration 0002 -- privilégios e RLS (sem visibilidade pra anon/authenticated)", () => {
  test("RLS ligada, sem nenhuma policy criada", () => {
    assert.match(migration, /alter table public\.admin_login_attempts enable row level security;/);
    assert.ok(!/create policy/i.test(migration), "não deveria existir NENHUMA policy -- defesa em profundidade");
  });

  test("tabela: acesso revogado de public/anon/authenticated, concedido só a service_role", () => {
    assert.match(migration, /revoke all on public\.admin_login_attempts from public, anon, authenticated;/);
    assert.match(migration, /grant select, insert, update, delete on public\.admin_login_attempts to service_role;/);
  });

  test("funções: EXECUTE revogado de public/anon/authenticated, concedido só a service_role", () => {
    for (const fn of ["admin_login_consume_attempt(text)", "admin_login_register_success(text)"]) {
      assert.match(migration, new RegExp(`revoke all on function public\\.${fn.replace(/[()]/g, "\\$&")} from public, anon, authenticated;`));
      assert.match(migration, new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, "\\$&")} to service_role;`));
    }
  });

  test("todas as funções são SECURITY DEFINER com search_path travado", () => {
    const blocos = migration.split(/create or replace function/).slice(1);
    for (const bloco of blocos) {
      if (/^\s*public\.admin_login_attempts_set_updated_at/.test(bloco)) continue; // trigger interno, não é RPC chamável
      assert.match(bloco, /security definer/, `função sem SECURITY DEFINER: ${bloco.slice(0, 60)}`);
      assert.match(bloco, /set search_path = public, pg_temp/, `função sem search_path travado: ${bloco.slice(0, 60)}`);
    }
  });
});

describe("Migration 0002 -- nenhum dado pessoal, sem cron", () => {
  test("attempt_key é a única identificação de quem tentou -- nenhuma coluna de IP em texto puro na tabela", () => {
    const tableStart = migration.indexOf("create table if not exists public.admin_login_attempts");
    const tableEnd = migration.indexOf(");", tableStart);
    const tableDef = migration.slice(tableStart, tableEnd);
    assert.match(tableDef, /attempt_key text primary key/);
    assert.doesNotMatch(tableDef, /\bip\b/i, "a definição da tabela não deveria ter nenhuma coluna chamada/relacionada a 'ip'");
  });

  test("nenhuma extensão/rotina de agendamento (pg_cron ou equivalente)", () => {
    assert.ok(!/pg_cron/i.test(migration));
    assert.ok(!/schedule\(/i.test(migration));
  });
});
