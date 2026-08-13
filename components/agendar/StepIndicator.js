"use client";

const STEP_LABELS = ["Modalidade", "Data", "Horário", "Seus dados", "Revisão"];

export default function StepIndicator({ currentIndex }) {
  return (
    <div className="flex items-start gap-1.5 mb-6" aria-label={`Etapa ${currentIndex + 1} de ${STEP_LABELS.length}`}>
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1">
          <div className={`h-1.5 w-full rounded-full ${i <= currentIndex ? "bg-gold" : "bg-cream2"}`} aria-hidden="true" />
          <span className={`text-[10px] hidden sm:block text-center ${i === currentIndex ? "text-navy font-semibold" : "text-gray-400"}`}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
