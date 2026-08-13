import { randomBytes } from "node:crypto";

// Sem 0/O/1/I para evitar confusao visual quando a pessoa le o codigo em
// voz alta ou copia a mao.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Gera um identificador publico curto para o agendamento (ex.: AGD-7F3K9QZP).
// Nao e sequencial e nao expoe quantidade de agendamentos feitos.
export function generatePublicId() {
  const bytes = randomBytes(8);
  let id = "";
  for (let i = 0; i < bytes.length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `AGD-${id}`;
}
