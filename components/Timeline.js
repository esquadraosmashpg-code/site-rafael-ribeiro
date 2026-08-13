import { timeline } from "@/config/content";
import CTAAgendar from "@/components/CTAAgendar";

export default function Timeline() {
  return (
    <section id="como-funciona" className="bg-navy text-white py-16 md:py-20 scroll-mt-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center text-xs tracking-widest uppercase text-gold font-bold mb-2">
          Como funciona
        </div>
        <h2 className="text-center text-2xl md:text-3xl font-serif mb-10">
          O tratamento, passo a passo
        </h2>
        <div className="flex flex-wrap justify-between gap-6 relative mb-12">
          {timeline.map((item) => (
            <div key={item.titulo} className="flex-1 min-w-[130px] text-center">
              <div className="w-3.5 h-3.5 rounded-full bg-gold mx-auto mb-3" />
              <b className="text-sm">{item.titulo}</b>
              <p className="text-xs text-[#d8dce6] mt-1">{item.texto}</p>
            </div>
          ))}
        </div>
        <CTAAgendar apoio="Escolha uma data e horário disponíveis." variant="dark" />
      </div>
    </section>
  );
}
