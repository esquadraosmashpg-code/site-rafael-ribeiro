"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { site, ctaAgendar } from "@/config/content";

// IDs precisam bater exatamente com o `id` de cada <section> na página
// (Hero, Sobre/QuemERafael, Analise, Timeline, ParaQuemCards, Faq) --
// coberto por teste em tests/navegacaoConversao.test.js.
const NAV_ITEMS = [
  { id: "inicio", label: "Início" },
  { id: "quem-e-rafael", label: "Quem é Rafael" },
  { id: "a-analise", label: "A análise" },
  { id: "como-funciona", label: "Como funciona" },
  { id: "areas-atuacao", label: "Áreas de atuação" },
  { id: "faq", label: "Perguntas frequentes" },
];

export default function Nav() {
  const [active, setActive] = useState(NAV_ITEMS[0].id);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef(null);

  // Scrollspy: a cada scroll, acha a ÚLTIMA seção (em ordem de página)
  // cujo topo já passou da linha do header fixo -- essa é a "atual".
  // Deliberadamente não usa IntersectionObserver com rootMargin negativo:
  // em saltos de rolagem (scrollIntoView instantâneo, ou rolagem muito
  // rápida) o observer pode nunca reportar a interseção da seção de
  // destino, deixando a seção antiga marcada como ativa indefinidamente.
  // Recalcular a partir de getBoundingClientRect a cada scroll é simples,
  // barato (poucas seções) e sempre correto, independente de como a
  // rolagem aconteceu.
  useEffect(() => {
    const sections = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(Boolean);
    if (sections.length === 0) return undefined;

    const HEADER_OFFSET = 96; // px -- altura do header fixo + folga

    let ticking = false;
    function updateActive() {
      let current = sections[0].id;
      for (const el of sections) {
        if (el.getBoundingClientRect().top <= HEADER_OFFSET) current = el.id;
      }
      setActive(current);
      ticking = false;
    }
    function onScrollOrResize() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateActive);
    }

    updateActive();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  // Esc fecha o menu mobile e devolve o foco pro botão que abriu.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setMobileOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function closeMobile() {
    setMobileOpen(false);
  }

  // Marca a seção como ativa imediatamente ao clicar -- não espera o
  // scroll suave terminar (e o listener de scroll) pra dar feedback
  // visual. O listener de scroll continua sendo a fonte de verdade
  // quando a pessoa rola manualmente com o mouse/trackpad.
  function handleNavClick(id) {
    setActive(id);
  }

  return (
    <nav className="sticky top-0 z-50 bg-navy/95 backdrop-blur text-white" aria-label="Navegação principal">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-6 py-3">
        <a
          href="#inicio"
          onClick={() => handleNavClick("inicio")}
          className="font-bold tracking-wide whitespace-nowrap text-sm md:text-base"
        >
          {site.nome} <span className="text-gold font-normal">| Hipnoterapeuta</span>
        </a>

        <div className="hidden md:flex items-center gap-5 text-sm">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={() => handleNavClick(item.id)}
              aria-current={active === item.id ? "true" : undefined}
              className={`pb-1 border-b-2 transition hover:text-gold ${
                active === item.id ? "text-gold border-gold" : "opacity-85 border-transparent"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>

        <Link
          href={ctaAgendar.href}
          className="hidden md:inline-block bg-gold text-[#1b1200] px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap hover:-translate-y-0.5 transition"
        >
          {ctaAgendar.texto}
        </Link>

        <button
          ref={toggleRef}
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="menu-mobile"
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          className="md:hidden text-2xl leading-none p-2 -mr-2"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {mobileOpen && (
        <div
          id="menu-mobile"
          className="md:hidden bg-navy-dark border-t border-white/10 px-6 py-4 space-y-1 max-h-[calc(100vh-56px)] overflow-y-auto"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={() => {
                handleNavClick(item.id);
                closeMobile();
              }}
              aria-current={active === item.id ? "true" : undefined}
              className={`block py-2.5 text-sm border-b border-white/5 last:border-b-0 ${
                active === item.id ? "text-gold font-semibold" : "text-white/85"
              }`}
            >
              {item.label}
            </a>
          ))}
          <Link
            href={ctaAgendar.href}
            onClick={closeMobile}
            className="block mt-4 text-center bg-gold text-[#1b1200] px-5 py-3 rounded-full text-sm font-bold"
          >
            {ctaAgendar.texto}
          </Link>
        </div>
      )}
    </nav>
  );
}
