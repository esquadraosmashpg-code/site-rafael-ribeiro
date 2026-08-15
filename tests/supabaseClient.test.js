import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isSupabaseConfigured, supabaseRpc, supabaseSelect } from "../lib/supabase/client.js";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("isSupabaseConfigured", () => {
  test("false sem as duas variáveis", () => {
    assert.equal(isSupabaseConfigured(), false);
  });
  test("true com as duas variáveis presentes", () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave";
    assert.equal(isSupabaseConfigured(), true);
  });
});

describe("supabaseRpc / supabaseSelect -- nunca expõe a service_role key em erro pro chamador", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-secreta-de-servico";
  });

  test("lança sem SUPABASE_URL/KEY configurados", async () => {
    delete process.env.SUPABASE_URL;
    await assert.rejects(() => supabaseRpc("create_booking", {}));
  });

  test("envia apikey/Authorization com a service_role key nos headers da requisição", async () => {
    let headersRecebidos;
    global.fetch = async (url, options) => {
      headersRecebidos = options.headers;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    await supabaseRpc("alguma_funcao", { x: 1 });
    assert.equal(headersRecebidos.apikey, "chave-secreta-de-servico");
    assert.equal(headersRecebidos.Authorization, "Bearer chave-secreta-de-servico");
  });

  test("em erro HTTP, a mensagem lançada nunca contém a service_role key", async () => {
    global.fetch = async () => new Response("erro qualquer, sem a chave", { status: 500 });
    try {
      await supabaseRpc("alguma_funcao", {});
      assert.fail("deveria ter lançado");
    } catch (err) {
      assert.ok(!String(err.message).includes("chave-secreta-de-servico"));
      assert.ok(!String(err.body || "").includes("chave-secreta-de-servico"));
    }
  });

  test("supabaseSelect monta a query string do PostgREST corretamente", async () => {
    let urlChamada;
    global.fetch = async (url) => {
      urlChamada = url;
      return new Response("[]", { status: 200 });
    };
    await supabaseSelect("bookings", "select=*&status=eq.CONFIRMED");
    assert.equal(urlChamada, "https://x.supabase.co/rest/v1/bookings?select=*&status=eq.CONFIRMED");
  });

  test("204 No Content devolve null sem tentar fazer parse de JSON vazio", async () => {
    global.fetch = async () => new Response(null, { status: 204 });
    const result = await supabaseRpc("funcao_sem_retorno", {});
    assert.equal(result, null);
  });
});
