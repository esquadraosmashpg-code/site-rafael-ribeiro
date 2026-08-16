import { ImageResponse } from "next/og";

// Ícones do painel administrativo (favicon + ícones Android de
// "Adicionar à tela inicial"/"Instalar app") -- gerados por código com
// next/og, sem nenhum arquivo de imagem novo no projeto. Só existem
// dentro de app/admin/agendamentos/, então não mudam o favicon do site
// público. Dois tamanhos (192x192 e 512x512) porque é o mínimo que o
// Chrome/Android exige no manifest pra considerar o app "instalável".
export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

// O Next (16.2.12) chama o handler de uma rota de imagem com múltiplos
// tamanhos passando `id` como PROMISE, não como string direta -- por
// isso precisa `await`. Sem o await, `id` era um objeto Promise em
// ambos os tamanhos, a comparação `id === "512"` nunca era verdadeira,
// e as duas rotas (192 e 512) geravam sempre o ícone de 192x192. Bug
// confirmado via debug direto (`console.error` do valor recebido) e
// corrigido aqui -- ver validação da auditoria pros bytes reais das
// duas rotas depois da correção.
export default async function Icon({ id }) {
  const idResolvido = await id;
  const tamanho = idResolvido === "512" ? 512 : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#101a30",
          fontSize: Math.round(tamanho * 0.55),
        }}
      >
        📅
      </div>
    ),
    { width: tamanho, height: tamanho }
  );
}
