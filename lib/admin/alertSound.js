// Bipe de alerta pro painel administrativo, gerado por código via Web
// Audio API -- sem nenhum arquivo de áudio externo (mantém o projeto sem
// dependências pesadas nem assets binários novos). Só roda no navegador
// (client component); em qualquer ambiente sem suporte a AudioContext,
// vira um no-op silencioso -- nunca quebra a tela por causa do som.
"use client";

let audioContext = null;

// Precisa ser chamado a partir de um gesto do usuário (clique) na
// PRIMEIRA vez -- é a política de autoplay dos navegadores. Depois de
// "destravado" uma vez, o mesmo AudioContext pode tocar bipes
// disparados automaticamente (ex.: pelo polling) pelo resto da sessão
// da página, sem precisar de novo gesto.
export function unlockAlertSound() {
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return true;
  } catch {
    return false;
  }
}

// Toca dois bipes curtos e distintos (não é só um "tick") -- fácil de
// notar mesmo com o painel em segundo plano/minimizado, mas curto o
// bastante pra não incomodar num ambiente de consultório.
// Libera os recursos do AudioContext -- chamado no cleanup do
// componente (desmontagem do painel). Nunca deixa o contexto de áudio
// aberto depois que a tela que o criou não existe mais.
export function closeAlertSound() {
  try {
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
  } catch {
    // Fechar o contexto nunca deveria quebrar a navegação -- pior caso
    // é o recurso ficar aberto até a aba fechar sozinha.
  }
}

export function playAlertBeep() {
  if (!audioContext) return;
  try {
    const tocarBipe = (quandoMs, frequenciaHz) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequenciaHz;
      const inicio = audioContext.currentTime + quandoMs / 1000;
      const duracao = 0.18;
      gain.gain.setValueAtTime(0, inicio);
      gain.gain.linearRampToValueAtTime(0.25, inicio + 0.02);
      gain.gain.linearRampToValueAtTime(0, inicio + duracao);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(inicio);
      oscillator.stop(inicio + duracao + 0.02);
    };
    tocarBipe(0, 880);
    tocarBipe(220, 1108);
  } catch {
    // Falha ao tocar som nunca deveria quebrar o painel -- o alerta
    // visual/notificação do navegador continuam funcionando de qualquer
    // jeito.
  }
}
