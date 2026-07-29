"use client";
import Image from "next/image";
import { hero } from "@/config/content";

export default function Hero({ onOpenChat }) {
  const handleTriagem = (opt) => {
    if (opt.acao === "scroll") {
      document.getElementById(opt.alvo)?.scrollIntoView({ behavior: "smooth" });
    } else {
      onOpenChat();
    }
  };

  return (
    <header className="bg-gradient-to-b from-navy to-navy-dark text-white py-16 md:py-24">
      <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-[1.1fr_.9fr] gap-12 items-center">
        <div>
          <div className="text-xs tracking-widest uppercase text-gold font-bold mb-3">
            Recepção Inteligente
          </div>
          <h1 className="text-3xl md:text-4xl leading-tight font-serif mb-5">
            {hero.headline.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </h1>
          <p className="text-[#d8dce6] mb-7 max-w-md">{hero.subheadline}</p>
          <button
            onClick={onOpenChat}
            className="inline-block bg-gold text-[#1b1200] px-7 py-4 rounded-full font-bold shadow-lg shadow-black/30 hover:-translate-y-0.5 transition"
          >
            {hero.ctaPrincipal}
          </button>

          <div className="mt-9">
            <p className="text-xs uppercase tracking-widest text-gold font-bold mb-3">
              Como posso ajudar você hoje?
            </p>
            <div className="space-y-2">
              {hero.triagem.map((opt) => (
                <div
                  key={opt.texto}
                  onClick={() => handleTriagem(opt)}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-3 rounded-xl cursor-pointer hover:bg-white/10 hover:border-gold transition text-sm"
                >
                  <span>{opt.emoji}</span>
                  <span>{opt.texto}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center order-first md:order-last">
          <Image
            src="/rafael-photo.jpg"
            alt="Rafael Ribeiro"
            width={320}
            height={240}
            className="rounded-2xl shadow-2xl border-4 border-white/10 mx-auto w-64 md:w-80 h-auto"
            priority
          />
        </div>
      </div>
    </header>
  );
}
