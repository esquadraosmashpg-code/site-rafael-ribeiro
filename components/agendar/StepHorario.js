"use client";

export default function StepHorario({ horarios, loading, erro, value, onSelect }) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-2" aria-live="polite" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-20 h-10 rounded-full bg-cream2 animate-pulse" />
        ))}
      </div>
    );
  }

  if (erro) {
    return (
      <p className="text-sm text-danger" role="alert">
        {erro}
      </p>
    );
  }

  if (horarios.length === 0) {
    return <p className="text-sm text-gray-500">Nenhum horário livre nesse dia. Volte e escolha outra data.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2" role="listbox" aria-label="Horários disponíveis">
      {horarios.map((h) => (
        <button
          key={h.horario}
          type="button"
          role="option"
          aria-selected={value === h.horario}
          onClick={() => onSelect(h.horario)}
          className={`px-4 py-2 rounded-full text-sm border transition ${
            value === h.horario
              ? "bg-navy text-white border-navy"
              : "bg-white border-gold/50 text-navy hover:bg-gold hover:text-white"
          }`}
        >
          {h.horario}
        </button>
      ))}
    </div>
  );
}
