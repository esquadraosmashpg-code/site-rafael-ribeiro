"use client";
import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 10_000;

function formatContagem(ms) {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Tela de reserva provisória (30 minutos) enquanto aguarda o Pix. A
// AUTORIDADE sobre o prazo é sempre o servidor: o contador local é só
// visual (calculado a partir de `expiresAt`, devolvido pela API), e o
// componente confirma periodicamente o status real via polling em
// GET /api/agendar/reserva/[codigo]/status -- nunca assume que o
// pagamento foi validado só porque o contador chegou a zero ou porque a
// pessoa clicou no WhatsApp.
export default function StepReserva({ resultado, onEscolherOutroHorario }) {
  const [statusServidor, setStatusServidor] = useState("PENDING_PAYMENT");
  const [agora, setAgora] = useState(() => Date.now());
  const [copiado, setCopiado] = useState(false);
  const pollTimerRef = useRef(null);

  const expiresAtMs = new Date(resultado.expiresAt).getTime();
  const restanteMs = expiresAtMs - agora;
  const expirouLocalmente = restanteMs <= 0;
  const expirouNoServidor = statusServidor === "EXPIRED" || statusServidor === "PAYMENT_REJECTED";
  const confirmado = statusServidor === "CONFIRMED";

  useEffect(() => {
    const tick = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    // Nunca faz sentido continuar perguntando ao servidor depois de um
    // estado terminal (confirmado/expirado/rejeitado).
    if (confirmado || expirouNoServidor) return;

    let cancelado = false;
    async function verificarStatus() {
      try {
        const res = await fetch(`/api/agendar/reserva/${resultado.publicId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelado && json.status) setStatusServidor(json.status);
      } catch {
        // Falha de rede na checagem periódica não é crítica -- o contador
        // local continua funcionando e a próxima tentativa de polling
        // cobre isso; nunca afirma nada sobre o pagamento com base num erro.
      }
    }

    verificarStatus();
    pollTimerRef.current = setInterval(verificarStatus, POLL_INTERVAL_MS);
    return () => {
      cancelado = true;
      clearInterval(pollTimerRef.current);
    };
  }, [resultado.publicId, confirmado, expirouNoServidor]);

  async function copiarChavePix() {
    if (!resultado.pix?.key) return;
    try {
      await navigator.clipboard.writeText(resultado.pix.key);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Falha ao copiar não é crítica -- a chave continua visível pra
      // copiar manualmente.
    }
  }

  if (confirmado) {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl" aria-hidden="true">
          ✅
        </div>
        <h2 className="text-xl font-serif text-navy">Reserva confirmada!</h2>
        <p className="text-sm text-gray-600">
          O Dr. Rafael já confirmou o recebimento do sinal. Você vai receber o convite por e-mail.
        </p>
        <p className="text-sm text-gray-600">
          Código: <b>{resultado.publicId}</b>
        </p>
      </div>
    );
  }

  if (expirouLocalmente || expirouNoServidor) {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl" aria-hidden="true">
          ⏰
        </div>
        <h2 className="text-xl font-serif text-navy">O prazo desta reserva terminou</h2>
        <p className="text-sm text-gray-600">
          Os 30 minutos para envio do comprovante do sinal já passaram, então o horário voltou a ficar disponível
          para outras pessoas.
        </p>
        <button
          type="button"
          onClick={onEscolherOutroHorario}
          className="w-full bg-navy text-white font-bold rounded-xl py-3"
        >
          Escolher outro horário
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <div className="text-4xl" aria-hidden="true">
          ⏳
        </div>
        <h2 className="text-xl font-serif text-navy">Horário reservado por 30 minutos</h2>
        <p className="text-sm text-gray-600">
          Envie o comprovante do sinal para garantir sua vaga. Se o prazo passar, o horário libera automaticamente.
        </p>
      </div>

      <div className="bg-white border rounded-2xl p-4 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-500">Código</span>
          <span className="text-navy font-mono font-semibold">{resultado.publicId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Data</span>
          <span className="text-navy font-medium">{resultado.dataFormatada}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Horário</span>
          <span className="text-navy font-medium">{resultado.horario}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Tempo restante</span>
          <span className="text-danger font-mono font-semibold" aria-live="polite">
            {formatContagem(restanteMs)}
          </span>
        </div>
      </div>

      <div className="bg-cream2 border border-gold/30 rounded-2xl p-4 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-500">Valor total</span>
          <span className="text-navy font-medium">{resultado.valorTotal}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Sinal (agora)</span>
          <span className="text-navy font-semibold">{resultado.sinal}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Saldo (no dia)</span>
          <span className="text-navy font-medium">{resultado.saldo}</span>
        </div>
      </div>

      {resultado.pix?.configured ? (
        <div className="bg-white border rounded-2xl p-4 text-sm space-y-2">
          <p className="text-gray-500">Chave Pix{resultado.pix.receiver ? ` — ${resultado.pix.receiver}` : ""}</p>
          <p className="text-navy font-mono font-semibold break-all">{resultado.pix.key}</p>
          <button
            type="button"
            onClick={copiarChavePix}
            className="w-full bg-white border border-gold text-navy text-sm font-semibold rounded-xl py-2.5"
          >
            {copiado ? "Chave copiada!" : "📋 Copiar chave Pix"}
          </button>
        </div>
      ) : (
        <div className="bg-white border rounded-2xl p-4 text-sm text-gray-600">
          A chave Pix ainda não está configurada neste ambiente. Fale pelo WhatsApp para combinar o pagamento do
          sinal.
        </div>
      )}

      {resultado.whatsapp?.configured && resultado.whatsapp.url ? (
        <a
          href={resultado.whatsapp.url}
          target="_blank"
          rel="noreferrer"
          className="block bg-[#25D366] text-white text-sm font-bold rounded-xl py-3 text-center"
        >
          💬 Enviar comprovante pelo WhatsApp
        </a>
      ) : (
        <div className="bg-white border rounded-2xl p-4 text-sm text-gray-600 text-center">
          O WhatsApp para envio do comprovante ainda não está configurado neste ambiente.
        </div>
      )}

      <p className="text-xs text-gray-500 text-center">
        A reserva só é confirmada depois que o Dr. Rafael validar o comprovante do sinal manualmente. Clicar no
        WhatsApp não confirma o pagamento por si só.
      </p>
    </div>
  );
}
