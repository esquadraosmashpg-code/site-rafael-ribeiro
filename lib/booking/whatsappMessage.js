// Mensagem PRONTA do WhatsApp -- texto EXATO confirmado, sem nenhum dado
// clínico. Só código/data/horário/valor do sinal. Mudar aqui reflete em
// todo lugar que usa o botão "Enviar comprovante pelo WhatsApp".
export function buildWhatsappReservaMessage({ publicCode, dataFormatada, horario }) {
  return `Olá! Fiz a reserva da análise com o Dr. Rafael Ribeiro.
Código: ${publicCode}
Data: ${dataFormatada}
Horário: ${horario}
Estou enviando o comprovante do sinal de R$ 150,00.`;
}

// Normaliza um número de WhatsApp pra DDI+DDD+número, só dígitos --
// remove espaços, parênteses, hífen, "+" etc. Não adiciona nem remove o
// "55" sozinho: espera que o número já venha completo (é assim que
// site.whatsappNumero em config/content.js está armazenado).
export function normalizeWhatsappNumber(numero) {
  return String(numero || "").replace(/\D/g, "");
}

// Monta o link wa.me a partir de um número (normalizado internamente) e,
// opcionalmente, uma mensagem PRÉ-preenchida em texto puro (não
// pré-codificada -- a codificação acontece aqui, uma única vez, pra
// nunca correr risco de codificar duas vezes). Sem mensagem, devolve só
// o link de abertura de conversa. Usado por TODOS os pontos do site que
// abrem uma conversa de WhatsApp -- Footer, ChatWidget, fluxo de
// reserva -- pra nunca ter uma segunda forma de montar esse link
// espalhada pelo código.
export function buildWhatsappUrl(numero, mensagem) {
  const digits = normalizeWhatsappNumber(numero);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base;
}
