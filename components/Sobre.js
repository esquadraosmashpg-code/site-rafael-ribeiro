import Image from "next/image";
import { sobre } from "@/config/content";
import CTAAgendar from "@/components/CTAAgendar";

// Seção "Quem é Rafael" -- bloco próprio, separado do resto do site.
// Conteúdo em config/content.js#sobre (trajetória/abordagem/propósito) --
// nenhum fato novo deve entrar aqui sem confirmação do Rafael.
export default function Sobre() {
  return (
    <section id="quem-e-rafael" className="bg-white py-16 md:py-20 scroll-mt-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid md:grid-cols-[.8fr_1.2fr] gap-12 items-center mb-10">
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
            <div className="text-xs tracking-widest uppercase text-gold font-bold mb-2">Quem é Rafael</div>
            <h2 className="text-2xl md:text-3xl font-serif text-navy mb-4">{sobre.titulo}</h2>
            <p className="text-[15px] leading-relaxed mb-4">{sobre.paragrafo}</p>
            <blockquote className="border-l-4 border-gold bg-cream rounded-r-xl px-5 py-4 italic text-navy">
              &ldquo;{sobre.citacao}&rdquo;
            </blockquote>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-5 mb-10">
          {sobre.blocos.map((bloco) => (
            <div key={bloco.titulo} className="bg-cream rounded-2xl p-5">
              <h3 className="text-navy font-semibold text-sm mb-2">{bloco.titulo}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{bloco.texto}</p>
            </div>
          ))}
        </div>

        <CTAAgendar apoio="Quer conversar diretamente com o Dr. Rafael sobre o seu caso?" />
      </div>
    </section>
  );
}
