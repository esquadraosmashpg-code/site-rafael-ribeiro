"use client";
import { bookingConfig } from "@/config/booking";

const LABELS_MODALIDADE = { online: "Online (Google Meet)", presencial: "Presencial" };

function Linha({ label, valor }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-navy font-medium text-right">{valor}</span>
    </div>
  );
}

export default function StepRevisao({ resumo, onConfirmar, enviando, erro }) {
  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-2xl p-4 text-sm space-y-2">
        <Linha label="Modalidade" valor={LABELS_MODALIDADE[resumo.modalidade]} />
        <Linha label="Data" valor={resumo.dataFormatada} />
        <Linha label="Horário" valor={`${resumo.horario} (Brasília, GMT-03)`} />
        <Linha label="Nome" valor={resumo.nome} />
        <Linha label="E-mail" valor={resumo.email} />
        <Linha label="WhatsApp" valor={resumo.whatsapp} />
        {resumo.modalidade === "presencial" && <Linha label="Endereço" valor={bookingConfig.presencial.endereco} />}
      </div>

      {erro && (
        <p className="text-sm text-danger" role="alert">
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={onConfirmar}
        disabled={enviando}
        className="w-full bg-navy text-white font-bold rounded-xl py-3 disabled:opacity-60"
      >
        {enviando ? "Confirmando…" : "Confirmar agendamento"}
      </button>
    </div>
  );
}
