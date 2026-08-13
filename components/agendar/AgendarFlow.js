"use client";
import { useEffect, useMemo, useState } from "react";
import { bookingConfig, isPresencialDisponivel } from "@/config/booking";
import { listAvailableDates } from "@/lib/booking/dates";
import { nowPartsInTZ } from "@/lib/booking/timezone";
import StepIndicator from "./StepIndicator";
import StepModalidade from "./StepModalidade";
import StepData from "./StepData";
import StepHorario from "./StepHorario";
import StepDados from "./StepDados";
import StepRevisao from "./StepRevisao";
import StepSucesso from "./StepSucesso";

const STEPS = ["modalidade", "data", "horario", "dados", "revisao", "sucesso"];

// Chave usada pela Secretária Virtual (ChatWidget) pra passar nome/whatsapp
// pra cá sem precisar digitar de novo. Só campos operacionais — nunca
// motivo/sintoma/dado clínico (ver ChatWidget.js).
const PREFILL_KEY = "secretariaPrefill";

function formatarDataLonga(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export default function AgendarFlow() {
  const [stepIndex, setStepIndex] = useState(0);
  const [modalidade, setModalidade] = useState(null);
  const [dataEscolhida, setDataEscolhida] = useState(null);
  const [horarios, setHorarios] = useState([]);
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  const [erroHorarios, setErroHorarios] = useState(null);
  const [horarioEscolhido, setHorarioEscolhido] = useState(null);
  const [form, setForm] = useState(() => {
    // Le o prefill (nome/whatsapp) deixado pela Secretaria Virtual antes de
    // qualquer render — evita precisar de um efeito so pra isso (e evita o
    // "flash" de campos vazios sendo preenchidos um instante depois).
    const base = { nome: "", email: "", whatsapp: "", aceite: false, website: "" };
    if (typeof window === "undefined") return base;
    try {
      const raw = sessionStorage.getItem(PREFILL_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      sessionStorage.removeItem(PREFILL_KEY);
      return { ...base, nome: parsed.nome || "", whatsapp: parsed.whatsapp || "" };
    } catch {
      return base;
    }
  });
  const [errosForm, setErrosForm] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState(null);
  const [resultado, setResultado] = useState(null);

  // "Agora" calculado uma única vez no carregamento, sempre no fuso do
  // consultório (bookingConfig.timezone via nowPartsInTZ) -- nunca no
  // fuso local implícito do navegador. A autoridade final de antecedência
  // mínima/data é sempre revalidada no servidor (GET disponibilidade e
  // POST confirmar), isso aqui só decide o que mostrar na tela.
  const datasDisponiveis = useMemo(() => listAvailableDates(bookingConfig), []);
  const hoje = useMemo(() => nowPartsInTZ(bookingConfig.timezone), []);

  useEffect(() => {
    if (!dataEscolhida) return;
    let cancelado = false;
    // Sincroniza o estado local com o sistema externo (a API de
    // disponibilidade) sempre que a data escolhida muda -- é exatamente o
    // caso de uso pretendido para efeito + setState (busca disparada por
    // mudança de dependência), diferente do prefill acima que foi movido
    // pro initializer do useState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingHorarios(true);
    setErroHorarios(null);
    setHorarioEscolhido(null);
    fetch(`/api/agendar/disponibilidade?data=${dataEscolhida}`)
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar horários");
        return res.json();
      })
      .then((json) => {
        if (!cancelado) setHorarios(json.slots || []);
      })
      .catch(() => {
        if (!cancelado) setErroHorarios("Não conseguimos carregar os horários agora. Tente novamente.");
      })
      .finally(() => {
        if (!cancelado) setLoadingHorarios(false);
      });
    return () => {
      cancelado = true;
    };
  }, [dataEscolhida]);

  function goTo(name) {
    setStepIndex(STEPS.indexOf(name));
  }

  function handleFormChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function podeAvancarDados() {
    return (
      form.nome.trim().length > 2 &&
      form.nome.trim().includes(" ") &&
      form.email.includes("@") &&
      form.whatsapp.replace(/\D/g, "").length >= 10 &&
      form.aceite
    );
  }

  async function confirmar() {
    setEnviando(true);
    setErroConfirmacao(null);
    try {
      const res = await fetch("/api/agendar/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modalidade,
          data: dataEscolhida,
          horario: horarioEscolhido,
          nome: form.nome,
          email: form.email,
          whatsapp: form.whatsapp,
          aceitePrivacidade: form.aceite,
          website: form.website,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErroConfirmacao(json.error || "Não foi possível confirmar. Tente novamente.");
        return;
      }
      setResultado(json);
      goTo("sucesso");
    } catch {
      setErroConfirmacao("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  const step = STEPS[stepIndex];

  return (
    <section className="max-w-lg mx-auto px-6 py-12 min-h-[60vh]">
      {step !== "sucesso" && <StepIndicator currentIndex={stepIndex} />}

      {step === "modalidade" && (
        <div>
          <h1 className="text-2xl font-serif text-navy mb-1">Agendar consulta</h1>
          <p className="text-sm text-gray-600 mb-5">Escolha como prefere ser atendido.</p>
          <StepModalidade
            value={modalidade}
            presencialDisponivel={isPresencialDisponivel(bookingConfig)}
            onSelect={(m) => {
              setModalidade(m);
              goTo("data");
            }}
          />
        </div>
      )}

      {step === "data" && (
        <div>
          <button type="button" onClick={() => goTo("modalidade")} className="text-xs text-gray-500 mb-3">
            ← Voltar
          </button>
          <h2 className="text-lg font-serif text-navy mb-1">Escolha uma data</h2>
          <p className="text-sm text-gray-600 mb-4">
            Atendimento {modalidade === "online" ? "online" : "presencial"} — segunda a sexta.
          </p>
          <StepData
            datasDisponiveis={datasDisponiveis}
            hoje={hoje}
            value={dataEscolhida}
            onSelect={(iso) => {
              setDataEscolhida(iso);
              goTo("horario");
            }}
          />
        </div>
      )}

      {step === "horario" && (
        <div>
          <button type="button" onClick={() => goTo("data")} className="text-xs text-gray-500 mb-3">
            ← Voltar
          </button>
          <h2 className="text-lg font-serif text-navy mb-1">Escolha um horário</h2>
          <p className="text-sm text-gray-600 mb-4 capitalize">
            {formatarDataLonga(dataEscolhida)} — horário de Brasília
          </p>
          <StepHorario
            horarios={horarios}
            loading={loadingHorarios}
            erro={erroHorarios}
            value={horarioEscolhido}
            onSelect={(h) => {
              setHorarioEscolhido(h);
              goTo("dados");
            }}
          />
        </div>
      )}

      {step === "dados" && (
        <div>
          <button type="button" onClick={() => goTo("horario")} className="text-xs text-gray-500 mb-3">
            ← Voltar
          </button>
          <h2 className="text-lg font-serif text-navy mb-1">Seus dados</h2>
          <p className="text-sm text-gray-600 mb-4">Só o necessário para confirmar sua consulta.</p>
          <StepDados form={form} onChange={handleFormChange} erros={errosForm} />
          <button
            type="button"
            disabled={!podeAvancarDados()}
            onClick={() => {
              if (!podeAvancarDados()) {
                setErrosForm(["Preencha nome completo, e-mail, WhatsApp e aceite a Política de Privacidade."]);
                return;
              }
              setErrosForm([]);
              goTo("revisao");
            }}
            className="w-full mt-5 bg-navy text-white font-bold rounded-xl py-3 disabled:opacity-40"
          >
            Continuar
          </button>
        </div>
      )}

      {step === "revisao" && (
        <div>
          <button type="button" onClick={() => goTo("dados")} className="text-xs text-gray-500 mb-3">
            ← Voltar
          </button>
          <h2 className="text-lg font-serif text-navy mb-1">Revise antes de confirmar</h2>
          <StepRevisao
            resumo={{
              modalidade,
              dataFormatada: formatarDataLonga(dataEscolhida),
              horario: horarioEscolhido,
              nome: form.nome,
              email: form.email,
              whatsapp: form.whatsapp,
            }}
            onConfirmar={confirmar}
            enviando={enviando}
            erro={erroConfirmacao}
          />
        </div>
      )}

      {step === "sucesso" && resultado && <StepSucesso resultado={resultado} />}
    </section>
  );
}
