// Leitura das variáveis de ambiente do sinal/Pix, e do WhatsApp público.
// Centralizado aqui pra nunca espalhar `process.env.BOOKING_*` pelo resto
// do código, e pra ter um único lugar que decide "está configurado ou
// não" -- nunca inventa um valor por padrão pro Pix (mostrar uma chave
// falsa seria pior do que avisar que a configuração está pendente).
import { site } from "../../config/content.js";

const DEFAULT_HOLD_MINUTES = 30;

export function getHoldMinutes() {
  const raw = Number(process.env.BOOKING_HOLD_MINUTES);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_HOLD_MINUTES;
}

// { configured: boolean, key: string|null, receiver: string|null }
export function getPixConfig() {
  const key = process.env.BOOKING_PIX_KEY || null;
  const receiver = process.env.BOOKING_PIX_RECEIVER || null;
  return { configured: Boolean(key), key, receiver };
}

// Número público do WhatsApp do Rafael -- MESMA fonte central usada pelo
// Footer, ChatWidget e página de contato (config/content.js#site.whatsappNumero).
// Deixou de ler a variável de ambiente equivalente que existia antes:
// como o número é público (não é segredo, ao contrário de Pix/senha),
// faz mais sentido como configuração central rastreada no projeto do
// que como variável de ambiente separada -- evitava exatamente o bug de
// duas fontes divergentes (uma no código, outra na env var) que já
// aconteceu aqui.
export function getWhatsappNumber() {
  return site.whatsappNumero || null;
}
