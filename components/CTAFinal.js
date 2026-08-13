import CTAAgendar from "@/components/CTAAgendar";

// Último empurrão antes do rodapé -- CTA principal do site (mesmo botão
// de sempre), só com um título de fechamento em volta.
export default function CTAFinal() {
  return (
    <section className="bg-white py-16 md:py-20 border-t border-cream2">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-serif text-navy mb-3">
          Pronto para dar o primeiro passo?
        </h2>
        <p className="text-gray-500 mb-2 max-w-md mx-auto">
          A análise é o começo — sem compromisso com um tratamento até que ela seja concluída.
        </p>
        <div className="mt-7">
          <CTAAgendar apoio="Escolha uma data e horário disponíveis." />
        </div>
      </div>
    </section>
  );
}
