"use client";
import { bookingConfig } from "@/config/booking";
import { analise } from "@/config/content";

const LABELS_MODALIDADE = { online: "Online (Google Meet)", presencial: "Presencial" };

function Linha({ label, valor }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-navy font-medium text-right">{valor}</span>
    </div>
  );
}

export default function StepRevisao({ resumo, aceiteComercial, onAceiteComercialChange, onConfirmar, enviando, erro }) {
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

      {/* Condições comerciais -- mostradas aqui, imediatamente antes da
          confirmação final, com checkbox próprio (separado do aceite de
          Política de Privacidade, que já foi dado na etapa anterior). O
          sinal NÃO foi pago (pagamento ainda não existe no site) -- o
          texto só informa o valor e a regra, nunca afirma cobrança feita
          nem condiciona a confirmação ao pagamento. */}
      <div className="bg-cream2 border border-gold/30 rounded-2xl p-4 text-sm space-y-3">
        <div>
          <b className="text-navy">{analise.nomeServico}</b>
          <div className="mt-2 space-y-1.5">
            <Linha label="Duração" valor={analise.duracao} />
            <Linha label="Valor total" valor={analise.valor} />
            <Linha label={analise.sinalTexto} valor={analise.sinal} />
            <Linha label={analise.saldoTexto} valor={analise.saldo} />
          </div>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed border-t border-gold/20 pt-2.5">
          {analise.politica.itens[0]}
        </p>
        <p className="text-[11px] text-gray-400">{analise.politica.notaDiscreta}</p>
        <label className="flex items-start gap-2 pt-1">
          <input
            type="checkbox"
            checked={aceiteComercial}
            onChange={(e) => onAceiteComercialChange(e.target.checked)}
            className="mt-1"
          />
          <span className="text-navy">{analise.checkboxComercial}</span>
        </label>
      </div>

      {erro && (
        <p className="text-sm text-danger" role="alert">
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={onConfirmar}
        disabled={enviando || !aceiteComercial}
        className="w-full bg-navy text-white font-bold rounded-xl py-3 disabled:opacity-60"
      >
        {enviando ? "Confirmando…" : "Confirmar agendamento"}
      </button>
    </div>
  );
}
