"use client";
import { useState } from "react";
import { faqs } from "@/config/content";
import CTAAgendar from "@/components/CTAAgendar";

export default function Faq() {
  const [open, setOpen] = useState(null);

  return (
    <section id="faq" className="bg-cream2 py-16 md:py-20 scroll-mt-20">
      <div className="max-w-2xl mx-auto px-6">
        <div className="text-center text-xs tracking-widest uppercase text-gold font-bold mb-2">
          Dúvidas
        </div>
        <h2 className="text-center text-2xl md:text-3xl font-serif text-navy mb-8">
          Perguntas frequentes
        </h2>
        <div className="space-y-3">
          {faqs.map((item, idx) => {
            const isOpen = open === idx;
            return (
              <div key={item.q} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div
                  onClick={() => setOpen(isOpen ? null : idx)}
                  className="px-5 py-4 font-bold text-navy cursor-pointer flex justify-between items-center text-sm"
                >
                  {item.q}
                  <span className={`text-gold text-lg transition-transform ${isOpen ? "rotate-45" : ""}`}>+</span>
                </div>
                <div
                  className={`px-5 text-sm text-gray-500 overflow-hidden transition-all ${
                    isOpen ? "max-h-40 pb-4" : "max-h-0"
                  }`}
                >
                  {item.a}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-10">
          <CTAAgendar apoio="Ainda com dúvidas? A análise é o próximo passo." />
        </div>
      </div>
    </section>
  );
}
