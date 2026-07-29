"use client";

export default function SecretariaCTA({ onOpenChat }) {
  return (
    <section className="bg-gradient-to-br from-gold to-[#8c6d3f] text-[#1b1200] text-center py-16 md:py-20">
      <div className="max-w-2xl mx-auto px-6">
        <div className="text-xs tracking-widest uppercase font-bold mb-3">Secretária Virtual</div>
        <h2 className="text-2xl md:text-3xl font-serif mb-3">Comece seu pré-atendimento agora</h2>
        <p className="opacity-90 mb-7">
          Leva menos de 3 minutos e já deixa tudo pronto para o Dr. Rafael te receber.
        </p>
        <button
          onClick={onOpenChat}
          className="bg-navy text-white px-9 py-4 rounded-full font-bold shadow-lg hover:opacity-90 transition"
        >
          Iniciar Pré-Atendimento
        </button>
      </div>
    </section>
  );
}
