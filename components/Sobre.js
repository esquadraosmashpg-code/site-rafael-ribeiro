import Image from "next/image";
import { sobre } from "@/config/content";

export default function Sobre() {
  return (
    <section id="sobre" className="bg-white py-16 md:py-20">
      <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-[.8fr_1.2fr] gap-12 items-center">
        <div className="text-center">
          <Image
            src="/rafael-photo.jpg"
            alt="Rafael Ribeiro"
            width={400}
            height={300}
            className="rounded-2xl shadow-xl w-full h-auto"
          />
        </div>
        <div>
          <div className="text-xs tracking-widest uppercase text-gold font-bold mb-2">Sobre</div>
          <h2 className="text-2xl md:text-3xl font-serif text-navy mb-4">{sobre.titulo}</h2>
          <p className="text-[15px] leading-relaxed mb-4">{sobre.paragrafo}</p>
          <blockquote className="border-l-4 border-gold bg-cream rounded-r-xl px-5 py-4 italic text-navy mb-5">
            &ldquo;{sobre.citacao}&rdquo;
          </blockquote>
          <button className="bg-navy text-white px-6 py-3 rounded-full font-semibold hover:opacity-90 transition">
            {sobre.cta}
          </button>
        </div>
      </div>
    </section>
  );
}
