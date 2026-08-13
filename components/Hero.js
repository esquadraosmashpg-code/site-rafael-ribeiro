"use client";
import Image from "next/image";
import Link from "next/link";
import { hero, ctaAgendar } from "@/config/content";

export default function Hero({ onOpenChat }) {
  const handleTriagem = (opt) => {
    if (opt.acao === "scroll") {
      document.getElementById(opt.alvo)?.scrollIntoView({ behavior: "smooth" });
    } else {
      onOpenChat();
    }
  };

  function handleTriagemKeyDown(e, opt) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleTriagem(opt);
    }
  }

  return (
    <header id="inicio" className="bg-gradient-to-b from-navy to-navy-dark text-white py-16 md:py-24 scroll-mt-20">
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
          <p className="text-[#d8dce6] mb-3 max-w-md">{hero.subheadline}</p>
          <p className="text-gold font-semibold mb-7 max-w-md text-sm">{hero.primeiroPasso}</p>

          <div className="flex flex-wrap gap-3 mb-9">
            <Link
              href={ctaAgendar.href}
              className="inline-block bg-gold text-[#1b1200] px-7 py-4 rounded-full font-bold shadow-lg shadow-black/30 hover:-translate-y-0.5 transition"
            >
              {hero.ctaPrincipal}
            </Link>
            <button
              type="button"
              onClick={() => document.getElementById(hero.ctaSecundarioAlvo)?.scrollIntoView({ behavior: "smooth" })}
              className="inline-block border border-white/30 text-white px-7 py-4 rounded-full font-semibold hover:bg-white/10 transition"
            >
              {hero.ctaSecundarioTexto}
            </button>
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-gold font-bold mb-3">
              Como posso ajudar você hoje?
            </p>
            <div className="space-y-2">
              {hero.triagem.map((opt) => (
                <div
                  key={opt.texto}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleTriagem(opt)}
                  onKeyDown={(e) => handleTriagemKeyDown(e, opt)}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-3 rounded-xl cursor-pointer hover:bg-white/10 hover:border-gold focus:outline-none focus:ring-2 focus:ring-gold transition text-sm"
                >
                  <span aria-hidden="true">{opt.emoji}</span>
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
