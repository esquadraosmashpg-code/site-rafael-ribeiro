import { analise } from "@/config/content";
import { bookingConfig, isPresencialDisponivel } from "@/config/booking";
import CTAAgendar from "@/components/CTAAgendar";

// Seção "A análise" -- bloco próprio, separado do resto do site.
// A disponibilidade do presencial usa a MESMA fonte de verdade do
// endpoint de agendamento (isPresencialDisponivel), pra nunca ficar
// dessincronizada do que /agendar realmente permite.
export default function Analise() {
  const presencialOk = isPresencialDisponivel(bookingConfig);

  return (
    <section id="a-analise" className="bg-cream2 py-16 md:py-20 scroll-mt-20">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center text-xs tracking-widest uppercase text-gold font-bold mb-2">
          {analise.nomeServico}
        </div>
        <h2 className="text-center text-2xl md:text-3xl font-serif text-navy mb-5">{analise.titulo}</h2>
        <p className="text-[15px] leading-relaxed text-center max-w-xl mx-auto mb-6">{analise.intro}</p>

        <ul className="grid sm:grid-cols-2 gap-3 mb-6">
          {analise.objetivos.map((item) => (
            <li key={item} className="bg-white rounded-xl px-4 py-3 text-sm flex gap-2.5">
              <span className="text-gold font-bold" aria-hidden="true">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p className="text-sm text-gray-600 leading-relaxed text-center max-w-xl mx-auto mb-10">
          {analise.fechamento}
        </p>

        <div className="bg-white rounded-2xl shadow p-6 md:p-8 mb-6">
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <dt className="text-xs uppercase tracking-widest text-gold font-bold mb-1">Valor da análise</dt>
              <dd className="text-xl font-serif text-navy">{analise.valor}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-gold font-bold mb-1">Duração</dt>
              <dd className="text-xl font-serif text-navy">{analise.duracao}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-gold font-bold mb-1">{analise.sinalTexto}</dt>
              <dd className="text-xl font-serif text-navy">{analise.sinal}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-gold font-bold mb-1">{analise.saldoTexto}</dt>
              <dd className="text-xl font-serif text-navy">{analise.saldo}</dd>
            </div>
          </dl>

          <div className="mt-6 pt-6 border-t border-cream2 flex flex-wrap gap-2 text-sm">
            <span className="bg-cream2 text-navy px-3 py-1.5 rounded-full font-medium">
              💻 {analise.modalidades.online}
            </span>
            <span
              className={`px-3 py-1.5 rounded-full font-medium ${
                presencialOk ? "bg-cream2 text-navy" : "bg-gray-100 text-gray-500"
              }`}
            >
              🏢 {presencialOk ? analise.modalidades.presencialDisponivel : analise.modalidades.presencialIndisponivel}
            </span>
          </div>
        </div>

        <div className="bg-white/60 border border-gold/30 rounded-2xl p-5 mb-10">
          <h3 className="text-navy font-semibold text-sm mb-2">{analise.politica.titulo}</h3>
          <ul className="text-sm text-gray-600 space-y-1.5 leading-relaxed">
            {analise.politica.itens.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-gold" aria-hidden="true">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400 mt-3">{analise.politica.notaDiscreta}</p>
        </div>

        <CTAAgendar apoio="Dê o primeiro passo com clareza." />
      </div>
    </section>
  );
}
