"use client";
import { useEffect, useRef, useState } from "react";
import { passosHipnoterapia } from "@/config/content";

export default function HipnoterapiaSteps() {
  const ref = useRef(null);
  const [visible, setVisible] = useState([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            passosHipnoterapia.forEach((_, idx) => {
              setTimeout(() => setVisible((v) => [...v, idx]), idx * 220);
            });
            io.disconnect();
          }
        });
      },
      { threshold: 0.3 }
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <section id="hipnoterapia" className="bg-cream2 py-16 md:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center text-xs tracking-widest uppercase text-gold font-bold mb-2">
          O que é
        </div>
        <h2 className="text-center text-2xl md:text-3xl font-serif text-navy mb-8">
          Hipnoterapia
        </h2>
        <div ref={ref} className="grid md:grid-cols-4 gap-4">
          {passosHipnoterapia.map((texto, idx) => (
            <div
              key={texto}
              className={`bg-white rounded-2xl p-6 text-center shadow transition-all duration-500 ${
                visible.includes(idx) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-navy text-gold flex items-center justify-center font-bold mx-auto mb-3">
                {idx + 1}
              </div>
              <p className="text-sm font-semibold">{texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
