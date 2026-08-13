// Guardas HTTP puras (so Web API padrao -- Request.headers/.body/.text()),
// sem nenhuma dependencia do Next.js. Extraidas do route handler pra
// ficarem testaveis com `node --test` sem precisar importar "next/server"
// (que so resolve dentro do bundler do proprio Next, nao no Node puro).

// So aceita requisicoes cuja Origin bate com o proprio host da requisicao
// (ou sem header Origin, que e comum em fetch same-origin em alguns
// navegadores/ambientes).
export function isAllowedOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function hasJsonContentType(request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.toLowerCase().includes("application/json");
}

// Le o corpo como texto respeitando um limite de tamanho. Nao confia so no
// header Content-Length (o cliente pode mentir) -- corta de verdade
// durante a leitura, chunk a chunk. Retorna null se passar do limite.
export async function readBodyWithLimit(request, maxBytes) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength && contentLength > maxBytes) return null;

  if (!request.body) return await request.text();

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}
