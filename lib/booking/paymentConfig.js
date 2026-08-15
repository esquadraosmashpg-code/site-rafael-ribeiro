// Leitura das variáveis de ambiente do sinal/Pix/WhatsApp. Centralizado
// aqui pra nunca espalhar `process.env.BOOKING_*` pelo resto do código, e
// pra ter um único lugar que decide "está configurado ou não" -- nunca
// inventa um valor por padrão pra Pix/WhatsApp (mostrar uma chave falsa
// seria pior do que avisar que a configuração está pendente).

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

export function getWhatsappNumber() {
  return process.env.BOOKING_WHATSAPP_NUMBER || null;
}
