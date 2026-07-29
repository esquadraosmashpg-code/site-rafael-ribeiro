"use client";
import { site } from "@/config/content";

export default function Nav({ onOpenChat }) {
  return (
    <nav className="sticky top-0 z-50 bg-navy/95 backdrop-blur text-white">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
        <div className="font-bold tracking-wide">
          {site.nome} <span className="text-gold font-normal">| Hipnoterapeuta</span>
        </div>
        <div className="hidden md:flex gap-6 text-sm">
          <a href="#sobre" className="opacity-85 hover:opacity-100 hover:text-gold transition">Sobre</a>
          <a href="#hipnoterapia" className="opacity-85 hover:opacity-100 hover:text-gold transition">Hipnoterapia</a>
          <a href="#paraquem" className="opacity-85 hover:opacity-100 hover:text-gold transition">Para quem é</a>
          <a href="#faq" className="opacity-85 hover:opacity-100 hover:text-gold transition">FAQ</a>
          <a href="#contato" className="opacity-85 hover:opacity-100 hover:text-gold transition">Contato</a>
        </div>
        <button
          onClick={onOpenChat}
          className="bg-gold text-[#1b1200] px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap"
        >
          Iniciar Atendimento
        </button>
      </div>
    </nav>
  );
}
