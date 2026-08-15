"use client";
import { bookingConfig } from "@/config/booking";

export default function StepModalidade({ value, onSelect, presencialDisponivel }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <button
        type="button"
        onClick={() => onSelect("online")}
        aria-pressed={value === "online"}
        className={`text-left p-5 rounded-2xl border-2 transition ${
          value === "online" ? "border-gold bg-cream2" : "border-gray-200 bg-white hover:border-gold/50"
        }`}
      >
        <div className="text-2xl mb-2" aria-hidden="true">💻</div>
        <b className="text-navy block mb-1">Atendimento online</b>
        <span className="text-sm text-gray-600">
          Por videochamada — o link do Google Meet é gerado automaticamente e enviado por e-mail.
        </span>
      </button>
      <button
        type="button"
        onClick={() => presencialDisponivel && onSelect("presencial")}
        aria-pressed={value === "presencial"}
        aria-disabled={!presencialDisponivel}
        disabled={!presencialDisponivel}
        className={`text-left p-5 rounded-2xl border-2 transition ${
          !presencialDisponivel
            ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
            : value === "presencial"
              ? "border-gold bg-cream2"
              : "border-gray-200 bg-white hover:border-gold/50"
        }`}
      >
        <div className="text-2xl mb-2" aria-hidden="true">🏢</div>
        <b className="text-navy block mb-1">Atendimento presencial</b>
        <span className="text-sm text-gray-600">
          {presencialDisponivel
            ? `No consultório: ${bookingConfig.presencial.endereco}`
            : "Em breve — por enquanto, agende online ou fale pelo WhatsApp."}
        </span>
      </button>
    </div>
  );
}
