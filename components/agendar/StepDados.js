"use client";

export default function StepDados({ form, onChange, erros }) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy mb-1">
          Nome completo
        </label>
        <input
          id="nome"
          autoComplete="name"
          value={form.nome}
          onChange={(e) => onChange("nome", e.target.value)}
          className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-navy mb-1">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold"
        />
      </div>
      <div>
        <label htmlFor="whatsapp" className="block text-sm font-semibold text-navy mb-1">
          WhatsApp (com DDD)
        </label>
        <input
          id="whatsapp"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 91234-5678"
          value={form.whatsapp}
          onChange={(e) => onChange("whatsapp", e.target.value)}
          className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold"
        />
      </div>

      {/* honeypot: campo escondido do humano por CSS — bot genérico que
          preenche todo input costuma cair aqui. Nunca receber foco por
          teclado (tabIndex -1) nem ser lido por leitor de tela como algo
          relevante. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="website">Não preencha este campo</label>
        <input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(e) => onChange("website", e.target.value)}
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.aceite}
          onChange={(e) => onChange("aceite", e.target.checked)}
          className="mt-1"
        />
        <span>
          Li e aceito a{" "}
          <a href="/privacidade" target="_blank" rel="noreferrer" className="text-navy underline">
            Política de Privacidade
          </a>
          .
        </span>
      </label>

      {erros?.length > 0 && (
        <ul className="text-sm text-danger space-y-1" role="alert">
          {erros.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
