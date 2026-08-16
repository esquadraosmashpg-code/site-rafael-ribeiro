import { ImageResponse } from "next/og";

// Ícone usado pelo iOS quando o Rafael faz "Adicionar à Tela de Início"
// a partir do painel administrativo (Safari exige um apple-touch-icon
// dedicado -- não reaproveita o ícone genérico). 180x180 é o tamanho
// recomendado pela Apple pra cobrir os dispositivos mais comuns sem
// downscale visível. Gerado por código, sem imagem nova no projeto.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 96,
        }}
      >
        📅
      </div>
    ),
    { ...size }
  );
}
