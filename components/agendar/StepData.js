"use client";
import { useMemo, useState } from "react";
import { toISO, parseISODate, formatMonthLabel } from "@/lib/booking/dates";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// `hoje` = {year, month, day} já calculado no fuso do consultório (ver
// AgendarFlow.js, via lib/booking/timezone.js#nowPartsInTZ). Este
// componente NUNCA lê `new Date()` local por conta própria -- toda noção
// de "agora" chega de fora, explícita, no fuso certo.
export default function StepData({ datasDisponiveis, value, onSelect, hoje }) {
  const disponiveisSet = useMemo(() => new Set(datasDisponiveis), [datasDisponiveis]);
  const primeiraDisponivel = datasDisponiveis[0] ? parseISODate(datasDisponiveis[0]) : null;

  // Lazy initializer: calcula o mês/ano inicial só uma vez, no mount, a
  // partir da primeira data disponível (ou de "hoje" se não houver
  // nenhuma) -- nunca do fuso local do navegador.
  const [viewYear, setViewYear] = useState(() => primeiraDisponivel?.year ?? hoje.year);
  const [viewMonth, setViewMonth] = useState(() => primeiraDisponivel?.month ?? hoje.month);

  // formatMonthLabel formata em UTC explicitamente -- ver o comentário em
  // lib/booking/dates.js sobre por que isso é obrigatório (sem isso, o
  // título do mês fica errado em qualquer fuso com offset negativo, ex.
  // America/Sao_Paulo).
  const monthLabel = formatMonthLabel(viewYear, viewMonth);

  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstWeekday = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  function changeMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  const podeVoltar = primeiraDisponivel
    ? viewYear > primeiraDisponivel.year || (viewYear === primeiraDisponivel.year && viewMonth > primeiraDisponivel.month)
    : false;

  if (datasDisponiveis.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Nenhuma data disponível no momento. Tente novamente mais tarde ou fale pelo WhatsApp.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          disabled={!podeVoltar}
          aria-label="Mês anterior"
          className="px-3 py-1 rounded-full border border-gold/40 text-navy disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ‹
        </button>
        <b className="capitalize text-navy">{monthLabel}</b>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Próximo mês"
          className="px-3 py-1 rounded-full border border-gold/40 text-navy"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1" aria-hidden="true">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" role="listbox" aria-label="Datas disponíveis">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = toISO({ year: viewYear, month: viewMonth, day: d });
          const disponivel = disponiveisSet.has(iso);
          const selecionado = value === iso;
          return (
            <button
              key={i}
              type="button"
              role="option"
              disabled={!disponivel}
              onClick={() => onSelect(iso)}
              aria-selected={selecionado}
              aria-label={iso}
              className={`aspect-square rounded-lg text-sm transition ${
                selecionado
                  ? "bg-navy text-white font-bold"
                  : disponivel
                    ? "bg-white border border-gold/50 text-navy hover:bg-gold hover:text-white"
                    : "text-gray-300 cursor-not-allowed"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
