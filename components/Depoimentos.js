"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { depoimentos } from "@/config/content";
import CTAAgendar from "@/components/CTAAgendar";

// Prova social -- prints de conversas já anonimizados ANTES de chegarem
// no repositório (nomes/fotos ocultados pela própria fonte). Este
// componente nunca deve tentar exibir ou inferir identidade: só
// referencia os arquivos neutros em public/depoimentos/ e usa alt text
// numerado e genérico. Sem carrossel com rotação automática --
// navegação sempre manual e estável, especialmente no celular.
export default function Depoimentos() {
  const [expandido, setExpandido] = useState(false);
  const [modalIdx, setModalIdx] = useState(null); // índice em depoimentos.imagens, ou null
  const openerRef = useRef(null); // elemento que abriu o modal -- recebe o foco de volta ao fechar
  const closeButtonRef = useRef(null);

  const visiveis = expandido
    ? depoimentos.imagens
    : depoimentos.imagens.slice(0, depoimentos.quantidadeInicial);

  function abrirModal(idx, elementoQueAbriu) {
    openerRef.current = elementoQueAbriu;
    setModalIdx(idx);
  }

  function fecharModal() {
    setModalIdx(null);
    openerRef.current?.focus();
  }

  // Escape fecha, foco vai pro botão de fechar ao abrir, e a rolagem do
  // fundo trava enquanto o modal estiver aberto -- restaura tudo no
  // cleanup (incluindo se o componente desmontar com o modal aberto).
  useEffect(() => {
    if (modalIdx === null) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") fecharModal();
    }
    document.addEventListener("keydown", onKeyDown);
    const overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflowOriginal;
    };
  }, [modalIdx]);

  const item = modalIdx !== null ? depoimentos.imagens[modalIdx] : null;

  return (
    <section id="depoimentos" className="bg-cream2 py-16 md:py-20 scroll-mt-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center text-xs tracking-widest uppercase text-gold font-bold mb-2">
          Depoimentos
        </div>
        <h2 className="text-center text-2xl md:text-3xl font-serif text-navy mb-2">
          {depoimentos.titulo}
        </h2>
        <p className="text-center text-sm text-gray-500 max-w-xl mx-auto mb-10">{depoimentos.aviso}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {visiveis.map((dep, idx) => (
            <button
              key={dep.arquivo}
              type="button"
              onClick={(e) => abrirModal(idx, e.currentTarget)}
              className="relative block w-full aspect-[3/4] rounded-2xl overflow-hidden bg-white shadow-sm hover:-translate-y-0.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2"
              aria-label={`Ampliar depoimento anônimo ${dep.numero}`}
            >
              <Image
                src={`/depoimentos/${dep.arquivo}`}
                alt={`Depoimento anônimo ${dep.numero} sobre atendimento com Rafael Ribeiro`}
                fill
                loading="lazy"
                sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>

        {!expandido && depoimentos.imagens.length > depoimentos.quantidadeInicial && (
          <div className="text-center mb-2">
            <button
              type="button"
              onClick={() => setExpandido(true)}
              className="inline-block border border-navy text-navy px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-navy hover:text-white transition"
            >
              Ver mais depoimentos
            </button>
          </div>
        )}

        <div className="mt-10">
          <CTAAgendar apoio="Comece também pela sua análise." />
        </div>
      </div>

      {item && (
        // Clique no fundo escuro fecha; clique dentro da imagem/dialog não
        // propaga (stopPropagation), então só o fundo e o botão ✕ fecham
        // por clique -- além do Escape, coberto no useEffect acima.
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={fecharModal}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Depoimento anônimo ${item.numero} sobre atendimento com Rafael Ribeiro`}
            className="relative max-w-sm w-full max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={fecharModal}
              aria-label="Fechar"
              className="absolute -top-10 right-0 text-white text-3xl leading-none p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              ✕
            </button>
            <Image
              src={`/depoimentos/${item.arquivo}`}
              alt={`Depoimento anônimo ${item.numero} sobre atendimento com Rafael Ribeiro`}
              width={item.largura}
              height={item.altura}
              sizes="(max-width: 640px) 90vw, 400px"
              className="w-full h-auto max-h-[88vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </section>
  );
}
