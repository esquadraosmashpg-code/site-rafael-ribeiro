"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { bookingConfig, isPresencialDisponivel } from "@/config/booking";
import { analise } from "@/config/content";
import { listAvailableDates } from "@/lib/booking/dates";
import { nowPartsInTZ } from "@/lib/booking/timezone";
import { createSubmitGuard, createAttemptKeyStore, gerarIdempotencyKey } from "@/lib/booking/submitGuard";
import StepIndicator from "./StepIndicator";
import StepModalidade from "./StepModalidade";
import StepData from "./StepData";
import StepHorario from "./StepHorario";
import StepDados from "./StepDados";
import StepRevisao from "./StepRevisao";
import StepReserva from "./StepReserva";

const STEPS = ["modalidade", "data", "horario", "dados", "revisao", "reserva"];

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
  const [aceiteComercial, setAceiteComercial] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState(null);
  const [resultado, setResultado] = useState(null);
  // Trava síncrona contra disparo duplo do "Confirmar agendamento" e
  // chave de idempotência estável -- as duas vivem num useRef, nunca em
  // useState/useMemo. useMemo é só uma otimização de performance, o
  // React não garante que o valor memorizado sobrevive entre renders;
  // useRef é a única primitiva com identidade garantida. Ver
  // lib/booking/submitGuard.js pra lógica (pura, testada isoladamente).
  //
  // O valor passado pra useRef(...) só é usado no PRIMEIRO render (é
  // assim que useRef funciona) -- em renders seguintes o React ignora o
  // argumento e mantém o `.current` que já existia, então criar um novo
  // objeto aqui a cada render é um desperdício pequeno e inofensivo, mas
  // NUNCA sobrescreve o guard/estado já em uso. Isso evita precisar ler
  // `.current` no corpo do render só pra inicializar (o que o
  // eslint-plugin-react-hooks mais novo rejeita -- refs só devem ser
  // lidos/escritos fora do render, em handler de evento ou efeito). Por
  // isso `.current` só é tocado dentro de confirmar() abaixo, nunca aqui.
  const submitGuardRef = useRef(createSubmitGuard());
  const attemptKeyStoreRef = useRef(createAttemptKeyStore(gerarIdempotencyKey));

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
    // Trava síncrona de verdade (useRef, não useState): mesmo que dois
    // handlers de clique observem o mesmo `enviando` antigo antes do
    // React repintar a tela, tryAcquire() é uma checagem+escrita síncrona
    // -- só UMA das duas chamadas consegue passar daqui. `enviando`
    // (useState) continua existindo só pra loading visual/acessibilidade
    // (aria-busy, texto do botão), nunca como a trava de verdade.
    if (!submitGuardRef.current.tryAcquire()) return;
    if (!aceiteComercial) {
      submitGuardRef.current.release(); // nunca chegou a tentar -- falha recuperável, libera
      return;
    }

    // A chave só muda de verdade quando a ESCOLHA (modalidade+data+horário)
    // muda -- nunca por causa de um re-render. keyFor() é idempotente:
    // chamar de novo com a mesma assinatura (retry desta mesma tentativa)
    // sempre devolve a mesma chave.
    const idempotencyKey = attemptKeyStoreRef.current.keyFor(`${modalidade}|${dataEscolhida}|${horarioEscolhido}`);

    setEnviando(true);
    setErroConfirmacao(null);
    try {
      const res = await fetch("/api/agendar/reservar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Chave de idempotência vai em header próprio -- nunca na URL
          // (não vaza em log de acesso/analytics como querystring
          // vazaria). O servidor valida formato e tamanho antes de usar.
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          modalidade,
          data: dataEscolhida,
          horario: horarioEscolhido,
          nome: form.nome,
          email: form.email,
          whatsapp: form.whatsapp,
          aceitePrivacidade: form.aceite,
          aceiteCondicoesComerciais: aceiteComercial,
          website: form.website,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErroConfirmacao(json.error || "Não foi possível confirmar. Tente novamente.");
        // Falha recuperável (erro de validação, horário ocupado, conflito
        // etc.) -- libera a trava pra pessoa poder tentar de novo. A
        // chave de idempotência continua a mesma (só muda se ela trocar
        // modalidade/data/horário), então um retry aqui é reconhecido
        // pelo servidor como a mesma tentativa.
        submitGuardRef.current.release();
        return;
      }
      // Sucesso: a trava NUNCA é liberada aqui de propósito -- a etapa
      // muda pra "reserva" (tela de espera do Pix) e o botão de
      // confirmar deixa de existir na tela, então não há mais como
      // reenviar por essa instância do componente de qualquer forma.
      // IMPORTANTE: sucesso aqui significa "reserva provisória criada",
      // NUNCA "agendamento confirmado" -- a confirmação só acontece depois
      // da validação manual do sinal pelo Rafael (ver StepReserva.js).
      setResultado(json);
      goTo("reserva");
    } catch {
      setErroConfirmacao("Erro de conexão. Verifique sua internet e tente novamente.");
      // Erro de rede é recuperável -- libera pra retry.
      submitGuardRef.current.release();
    } finally {
      setEnviando(false);
    }
  }

  // Reseta o fluxo pra escolher outro horário depois que a reserva
  // provisória expira -- cria um guard/chave de idempotência NOVOS (a
  // tentativa anterior já terminou, essa é uma tentativa nova de verdade,
  // nunca um retry da que expirou).
  function escolherOutroHorario() {
    submitGuardRef.current = createSubmitGuard();
    attemptKeyStoreRef.current = createAttemptKeyStore(gerarIdempotencyKey);
    setResultado(null);
    setErroConfirmacao(null);
    setHorarioEscolhido(null);
    goTo("horario");
  }

  const step = STEPS[stepIndex];

  return (
    <section className="max-w-lg mx-auto px-6 py-12 min-h-[60vh]">
      {step !== "reserva" && <StepIndicator currentIndex={stepIndex} />}

      {step === "modalidade" && (
        <div>
          <h1 className="text-2xl font-serif text-navy mb-1">Agendar {analise.nomeServico}</h1>
          <p className="text-sm text-gray-600 mb-5">
            {analise.duracao} · {analise.valor} (sinal {analise.sinal} + saldo {analise.saldo} no dia). Escolha como
            prefere ser atendido.
          </p>
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
            aceiteComercial={aceiteComercial}
            onAceiteComercialChange={setAceiteComercial}
            onConfirmar={confirmar}
            enviando={enviando}
            erro={erroConfirmacao}
          />
        </div>
      )}

      {step === "reserva" && resultado && (
        <StepReserva resultado={resultado} onEscolherOutroHorario={escolherOutroHorario} />
      )}
    </section>
  );
}
