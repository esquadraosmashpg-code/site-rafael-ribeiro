// Trava curta em memoria contra requisicoes duplicadas para o MESMO
// horario, na MESMA instancia do processo serverless.
//
// LIMITACAO IMPORTANTE (documentada conforme pedido): isso NAO e um lock
// distribuido. Ele reduz a chance de corrida quando duas requisicoes para
// o mesmo horario caem na mesma instancia "quente" da funcao, mas nao
// elimina 100% a corrida entre instancias diferentes rodando em paralelo.
// A defesa real contra overbooking neste projeto (sem banco dedicado) e a
// dupla checagem de disponibilidade (freeBusy) feita imediatamente antes
// de criar o evento no endpoint de confirmacao -- ver
// app/api/agendar/confirmar/route.js. Para eliminar de vez a corrida
// distribuida seria necessario um lock externo (ex.: constraint unica em
// banco, Redis com SETNX/expiracao) -- fora do escopo da V1.
const locks = new Set();

export function acquireLock(key, ttlMs = 10_000) {
  if (locks.has(key)) return false;
  locks.add(key);
  setTimeout(() => locks.delete(key), ttlMs).unref?.();
  return true;
}

export function releaseLock(key) {
  locks.delete(key);
}
