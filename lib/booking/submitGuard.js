// Duas pecas de estado imperativo pensadas pra morar dentro de um
// useRef() no componente React (AgendarFlow.js) -- nunca em useState nem
// useMemo. useMemo e uma otimizacao de performance, o proprio React NAO
// garante que o valor memorizado sobrevive entre renders (pode descartar
// e recalcular); useRef e a unica primitiva com garantia de identidade
// estavel entre renders. A logica em si nao depende de React nenhum, por
// isso fica separada aqui -- da pra testar direto, sem precisar renderizar
// componente nem simular clique de verdade.

// Trava sincrona contra disparo duplo de uma acao assincrona (ex.: o
// clique em "Confirmar agendamento"). `tryAcquire()` e uma checagem +
// escrita SINCRONA -- duas chamadas consecutivas, mesmo sem nenhum
// render/await entre elas, nunca conseguem as duas retornar true.
export function createSubmitGuard() {
  let locked = false;
  return {
    // Retorna true se conseguiu a trava (quem chamou deve prosseguir e,
    // mais cedo ou mais tarde, decidir entre `release()` -- falha
    // recuperavel, permite tentar de novo -- ou nao chamar nada -- sucesso
    // ou falha nao recuperavel, mantem travado pra sempre nesta instancia
    // do componente). Retorna false se já estava travada -- quem chamou
    // deve simplesmente ignorar a acao (nao é erro, é o clique duplicado
    // sendo descartado).
    tryAcquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    // Libera a trava -- só deve ser chamado depois de uma falha
    // RECUPERÁVEL (ex.: erro de validação, horário ocupado, erro de rede).
    // Nunca chamar depois de sucesso.
    release() {
      locked = false;
    },
    get isLocked() {
      return locked;
    },
  };
}

// Mantém uma chave de idempotência estável enquanto a "seleção" (ex.:
// modalidade+data+horário) não mudar. Repetir a mesma assinatura em
// renders sucessivos (ou em múltiplas chamadas de keyFor, com ou sem
// render no meio) sempre devolve a MESMA chave -- só gera uma nova de
// verdade quando a assinatura muda.
export function createAttemptKeyStore(generateKey) {
  let key = null;
  let signature = null;
  return {
    keyFor(novaAssinatura) {
      if (key === null || signature !== novaAssinatura) {
        key = generateKey();
        signature = novaAssinatura;
      }
      return key;
    },
    get currentKey() {
      return key;
    },
  };
}

// Gera um identificador de tentativa. Não precisa ser criptograficamente
// forte -- só único o bastante pra não colidir dentro da janela de cache
// do servidor (minutos, não anos).
export function gerarIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
