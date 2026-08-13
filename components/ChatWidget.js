"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { chatFlow, chatLabels, site, ctaAgendar } from "@/config/content";
import { containsRisk } from "@/lib/chat/risk";

// Chave lida por components/agendar/AgendarFlow.js pra pre-preencher o
// formulario de agendamento. So campos operacionais (nome/whatsapp) --
// nunca motivo, tempo, ja_fez etc. (dado clinico nao vai pra agenda).
const AGENDA_PREFILL_KEY = "secretariaPrefill";

export default function ChatWidget({ open, onClose }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [messages, setMessages] = useState([]);
  const [textValue, setTextValue] = useState("");
  const [finished, setFinished] = useState(false);
  const [riskFlag, setRiskFlag] = useState(false);
  const bodyRef = useRef(null);

  function finishChat(finalAnswers) {
    setFinished(true);
    setMessages((m) => [
      ...m,
      { who: "bot", text: `Obrigado, ${finalAnswers.nome || ""}! Agora vou encaminhar suas respostas ao Dr. Rafael.` },
      { who: "summary", data: finalAnswers },
    ]);
  }

  function askStep(idx, currentAnswers) {
    if (idx >= chatFlow.length) {
      finishChat(currentAnswers);
      return;
    }
    const s = chatFlow[idx];
    setMessages((m) => [...m, { who: "bot", text: s.bot }]);
  }

  const resetChat = () => {
    setStep(0);
    setAnswers({});
    setMessages([]);
    setFinished(false);
    setRiskFlag(false);
  };

  useEffect(() => {
    if (open && messages.length === 0) {
      const t = setTimeout(() => askStep(0, {}), 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleAnswer(value) {
    const s = chatFlow[step];
    setMessages((m) => [...m, { who: "user", text: value }]);
    const nextAnswers = { ...answers, [s.key]: value };
    setAnswers(nextAnswers);

    if (containsRisk(value)) {
      setRiskFlag(true);
      setMessages((m) => [
        ...m,
        {
          who: "bot",
          text:
            "Percebo que você pode estar passando por um momento muito difícil. Isso é mais importante do que qualquer pergunta do formulário.",
        },
      ]);
      setMessages((m) => [
        ...m,
        {
          who: "safety",
          text:
            "Você não precisa passar por isso sozinho(a) agora. Se possível, procure imediatamente alguém de confiança para ficar com você.\n\n📞 CVV — 188: apoio emocional, sigiloso, gratuito, 24h.\n🚑 Emergência imediata (risco de vida): SAMU — 192.\n\nEste pré-atendimento automatizado não substitui ajuda de emergência.",
        },
      ]);
      setFinished(true);
      return;
    }

    const next = step + 1;
    setStep(next);
    setTextValue("");
    setTimeout(() => askStep(next, nextAnswers), 350);
  }

  function submitText() {
    if (!textValue.trim()) return;
    handleAnswer(textValue.trim());
  }

  const currentStepDef = chatFlow[step];
  const progress = Math.min(100, Math.round((step / chatFlow.length) * 100));

  const waText = encodeURIComponent(
    `Olá! Meu nome é ${answers.nome || ""}, tenho ${answers.idade || ""} anos, sou de ${answers.cidade || ""}. Motivo do contato: ${answers.motivo || ""}. Prefiro atendimento ${answers.modalidade || ""} no período da ${answers.horario || ""}.`
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-navy-dark/70 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
        <div className="bg-navy text-white px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gold text-[#1b1200] flex items-center justify-center font-bold">
            RA
          </div>
          <div>
            <b className="block text-sm">Secretária Virtual</b>
            <span className="text-[11px] opacity-70">de {site.nome}</span>
          </div>
          <button onClick={() => { onClose(); resetChat(); }} className="ml-auto text-xl opacity-70">
            ✕
          </button>
        </div>

        <div className="h-1 bg-gray-100">
          <div className="h-full bg-gold transition-all" style={{ width: `${finished ? 100 : progress}%` }} />
        </div>

        <div ref={bodyRef} className="p-5 overflow-y-auto flex-1 bg-[#FAF8F5] space-y-3">
          {messages.map((m, i) => {
            if (m.who === "summary") {
              return (
                <div key={i} className="bg-white border rounded-2xl rounded-bl-sm p-3 text-sm max-w-[90%]">
                  <b>Resumo do pré-atendimento</b>
                  <br />
                  {Object.entries(m.data).map(([k, v]) => (
                    <div key={k}>
                      {chatLabels[k] || k}: {v}
                    </div>
                  ))}
                </div>
              );
            }
            if (m.who === "safety") {
              return (
                <div
                  key={i}
                  className="bg-red-50 border border-danger text-danger text-xs rounded-xl p-3 whitespace-pre-line leading-relaxed"
                >
                  ⚠️ {m.text}
                </div>
              );
            }
            return (
              <div
                key={i}
                className={`max-w-[85%] text-sm leading-relaxed p-3 rounded-2xl whitespace-pre-line ${
                  m.who === "bot"
                    ? "bg-white border rounded-bl-sm"
                    : "bg-navy text-white ml-auto rounded-br-sm"
                }`}
              >
                {m.text}
              </div>
            );
          })}

          {!finished && currentStepDef?.type === "chips" && (
            <div className="flex flex-wrap gap-2">
              {currentStepDef.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleAnswer(opt)}
                  className="bg-white border border-gold text-navy px-3.5 py-2 rounded-full text-xs hover:bg-gold hover:text-white transition"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {finished && riskFlag && (
            <div className="pt-1 space-y-2.5">
              <div className="flex gap-2.5 flex-wrap">
                <a
                  href="tel:188"
                  className="flex-1 bg-danger text-white text-xs font-bold rounded-xl py-3 text-center min-w-[140px]"
                >
                  📞 Ligar para o CVV (188)
                </a>
                <a
                  href="tel:192"
                  className="flex-1 bg-danger text-white text-xs font-bold rounded-xl py-3 text-center min-w-[140px]"
                >
                  🚑 Emergência: SAMU (192)
                </a>
              </div>
              <a
                href={`https://wa.me/${site.whatsappNumero}`}
                target="_blank"
                rel="noreferrer"
                className="block bg-white border border-gray-300 text-navy text-xs font-semibold rounded-xl py-2.5 text-center"
              >
                💬 Apoio adicional pelo WhatsApp com o Dr. Rafael
              </a>
              <p className="text-[11px] text-gray-500 text-center leading-relaxed">
                O WhatsApp não é canal de emergência nem atendimento 24h. Nenhuma resposta sua foi
                enviada automaticamente — você decide o que contar.
              </p>
            </div>
          )}

          {finished && !riskFlag && (
            <div className="flex gap-2.5 flex-wrap pt-1">
              <Link
                href={site.agendaPath}
                onClick={() => {
                  try {
                    sessionStorage.setItem(
                      AGENDA_PREFILL_KEY,
                      JSON.stringify({ nome: answers.nome || "", whatsapp: answers.telefone || "" })
                    );
                  } catch {
                    // sessionStorage indisponivel (ex.: modo privado) -- sem problema,
                    // a agenda so fica sem pre-preenchimento
                  }
                }}
                className="flex-1 bg-navy text-white text-xs font-bold rounded-xl py-3 text-center min-w-[140px]"
              >
                📅 {ctaAgendar.texto}
              </Link>
              <a
                href={`https://wa.me/${site.whatsappNumero}?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 bg-[#25D366] text-white text-xs font-bold rounded-xl py-3 text-center min-w-[140px]"
              >
                💬 Conversar no WhatsApp
              </a>
            </div>
          )}
        </div>

        {!finished && currentStepDef?.type === "text" && (
          <div className="flex gap-2 p-3 border-t bg-white">
            <input
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitText()}
              placeholder="Digite sua resposta..."
              className="flex-1 border rounded-full px-4 py-2 text-sm outline-none"
            />
            <button onClick={submitText} className="bg-navy text-white rounded-full px-4 py-2 text-xs font-semibold">
              Enviar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
