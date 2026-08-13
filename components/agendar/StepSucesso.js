"use client";
import Link from "next/link";
import { site } from "@/config/content";

function toGCalTimestamp(iso) {
  // "2026-08-20T12:00:00.000Z" -> "20260820T120000Z" (formato exigido
  // pelo link de "adicionar ao Google Agenda").
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export default function StepSucesso({ resultado }) {
  const isOnline = resultado.modalidade === "online";

  const waText = encodeURIComponent(
    `Olá! Acabei de agendar minha consulta ${isOnline ? "online" : "presencial"} para ${resultado.data} às ${resultado.horario}. Código: ${resultado.publicId}.`
  );

  const detalhes = [`Código: ${resultado.publicId}`, resultado.meetLink ? `Meet: ${resultado.meetLink}` : null]
    .filter(Boolean)
    .join(" — ");

  const gcalParams = new URLSearchParams({
    action: "TEMPLATE",
    text: `Consulta — ${site.nome}`,
    dates: `${toGCalTimestamp(resultado.inicioISO)}/${toGCalTimestamp(resultado.fimISO)}`,
    details: detalhes,
  });
  if (resultado.enderecoPresencial) gcalParams.set("location", resultado.enderecoPresencial);
  const gcalUrl = `https://calendar.google.com/calendar/render?${gcalParams.toString()}`;

  return (
    <div className="text-center space-y-4">
      <div className="text-4xl" aria-hidden="true">
        ✅
      </div>
      <h2 className="text-xl font-serif text-navy">Consulta confirmada!</h2>
      <p className="text-sm text-gray-600">
        Código do agendamento: <b>{resultado.publicId}</b>
      </p>

      {isOnline && resultado.meetLink && (
        <div className="bg-cream2 rounded-xl p-4 text-sm text-left">
          <p className="mb-2">Link da videochamada (Google Meet):</p>
          <a href={resultado.meetLink} target="_blank" rel="noreferrer" className="text-navy font-semibold underline break-all">
            {resultado.meetLink}
          </a>
          <p className="text-xs text-gray-500 mt-2">Você também vai receber o convite por e-mail.</p>
        </div>
      )}

      {!isOnline && resultado.enderecoPresencial && (
        <div className="bg-cream2 rounded-xl p-4 text-sm text-left">
          <p className="font-semibold text-navy mb-1">📍 {resultado.enderecoPresencial}</p>
          <p className="text-gray-600">{resultado.instrucoesPresencial}</p>
        </div>
      )}

      <a
        href={gcalUrl}
        target="_blank"
        rel="noreferrer"
        className="block bg-white border border-gold text-navy text-sm font-semibold rounded-xl py-2.5"
      >
        📅 Adicionar à minha agenda
      </a>

      <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
        <a
          href={`https://wa.me/${site.whatsappNumero}?text=${waText}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 bg-[#25D366] text-white text-sm font-bold rounded-xl py-3 text-center"
        >
          💬 Falar no WhatsApp
        </a>
        <Link href="/" className="flex-1 bg-navy text-white text-sm font-bold rounded-xl py-3 text-center">
          Voltar ao site
        </Link>
      </div>
    </div>
  );
}
