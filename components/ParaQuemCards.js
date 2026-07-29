"use client";
import { useState } from "react";
import { areasAtuacao } from "@/config/content";

export default function ParaQuemCards() {
  const [open, setOpen] = useState(null);

  return (
    <section id="paraquem" className="bg-white py-16 md:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-xs tracking-widest uppercase text-gold font-bold mb-2">
          Para quem é
        </div>
        <h2 className="text-2xl md:text-3xl font-serif text-navy mb-2">Áreas de atuação</h2>
        <p className="text-gray-500 max-w-xl mb-8">
          Toque em cada card para entender como o trabalho pode ajudar.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {areasAtuacao.map((area, idx) => {
            const isOpen = open === idx;
            return (
              <div
                key={area.titulo}
                onClick={() => setOpen(isOpen ? null : idx)}
                className={`bg-cream rounded-2xl p-5 cursor-pointer transition hover:-translate-y-0.5 border ${
                  isOpen ? "border-gold" : "border-transparent"
                }`}
              >
                <div className="text-[11px] text-gold font-bold mb-1">TOQUE PARA SABER MAIS</div>
                <h4 className="text-navy font-semibold text-sm mb-1">{area.titulo}</h4>
                <p
                  className={`text-xs text-gray-500 overflow-hidden transition-all ${
                    isOpen ? "max-h-40 mt-2" : "max-h-0"
                  }`}
                >
                  {area.texto}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
