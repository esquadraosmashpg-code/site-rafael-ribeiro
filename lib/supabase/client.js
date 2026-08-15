// Cliente mínimo do Supabase (PostgREST + RPC) via fetch puro -- sem o
// SDK @supabase/supabase-js, seguindo o mesmo padrão já usado pro Google
// Calendar (lib/google/calendarClient.js): menos dependência pesada, mais
// fácil de auditar.
//
// SERVER-SIDE APENAS. Usa SUPABASE_SERVICE_ROLE_KEY, que:
//   - nunca deve ter o prefixo NEXT_PUBLIC_ (isso a exporia ao navegador);
//   - nunca deve ser importada por um componente "use client";
//   - dá acesso total ao banco, ignorando RLS -- é exatamente por isso que
//     o navegador nunca fala com o Supabase diretamente: tudo passa pelas
//     rotas server-side deste projeto (app/api/agendar/*, app/api/admin/*).

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes).");
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseFetch(path, options = {}) {
  const { url, key } = getConfig();
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    // Nunca loga o corpo do REQUEST (pode conter nome/e-mail/telefone) --
    // só status HTTP e um trecho curto da resposta de ERRO do Postgres
    // (mensagem técnica, ex.: "duplicate key value violates..."), que não
    // carrega dado do paciente.
    let snippet = "";
    try {
      snippet = (await res.text()).slice(0, 300);
    } catch {
      // ignora falha ao ler o corpo do erro
    }
    console.error(`[supabase] erro ${res.status} em ${path}: ${snippet}`);
    const err = new Error(`Supabase respondeu ${res.status}`);
    err.status = res.status;
    err.body = snippet;
    throw err;
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Chama uma função RPC do Postgres: POST /rest/v1/rpc/<nome>.
// PostgREST devolve o valor de retorno da função diretamente (objeto,
// array, ou o composite type conforme definido em SQL).
export async function supabaseRpc(name, args = {}) {
  return supabaseFetch(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(args),
  });
}

// SELECT simples via PostgREST: GET /rest/v1/<table>?<queryString>.
// `queryString` usa a sintaxe de filtro do PostgREST (ex.: "select=id,status&status=eq.CONFIRMED").
export async function supabaseSelect(table, queryString = "") {
  const qs = queryString ? `?${queryString}` : "";
  return supabaseFetch(`/rest/v1/${table}${qs}`, { method: "GET" });
}
