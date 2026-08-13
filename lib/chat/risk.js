// Deteccao de risco (ideacao suicida etc.) da Secretaria Virtual.
// Extraido do ChatWidget pra ficar testavel isoladamente, sem precisar
// renderizar componente React nenhum. Mesma logica que ja existia
// (comparacao simples de substring em texto minusculo), so movida pra um
// modulo separado.
export const RISK_WORDS = ["suicid", "me matar", "acabar com tudo", "não aguento mais viver", "automutila"];

export function containsRisk(text) {
  const normalized = String(text || "").toLowerCase();
  return RISK_WORDS.some((word) => normalized.includes(word));
}
