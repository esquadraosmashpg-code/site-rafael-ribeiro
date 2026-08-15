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

export function buildWhatsappUrl(numero, mensagem) {
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
