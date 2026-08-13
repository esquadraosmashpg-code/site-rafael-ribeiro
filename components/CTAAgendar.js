import Link from "next/link";
import { ctaAgendar } from "@/config/content";

// Botão de CTA reutilizado no final das seções principais. Ação e destino
// são sempre os mesmos (Link pra /agendar) -- só o texto de apoio muda de
// seção pra seção, pra não virar excesso visual repetindo o mesmo bloco
// idêntico várias vezes na página.
export default function CTAAgendar({ apoio, className = "", variant = "light" }) {
  const isDark = variant === "dark";
  return (
    <div className={`text-center ${className}`}>
      {apoio && (
        <p className={`text-sm mb-3 ${isDark ? "text-[#d8dce6]" : "text-gray-500"}`}>{apoio}</p>
      )}
      <Link
        href={ctaAgendar.href}
        className="inline-block bg-gold text-[#1b1200] px-7 py-3.5 rounded-full font-bold shadow-lg shadow-black/10 hover:-translate-y-0.5 transition"
      >
        {ctaAgendar.texto}
      </Link>
    </div>
  );
}
