"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { site, ctaAgendar } from "@/config/content";

// IDs precisam bater exatamente com o `id` de cada <section> na página
// (Hero, Sobre/QuemERafael, Analise, Timeline, ParaQuemCards,
// Depoimentos, Faq) -- coberto por teste em tests/navegacaoConversao.test.js.
// "Depoimentos" só foi adicionado aqui depois de medir de verdade que
// os 7 itens continuam cabendo em uma linha só em 1280/1366/1440/1920px
// (ver tests/depoimentos.test.js) -- se algum dia não couber mais,
// tirar daqui primeiro em vez de comprimir o menu.
const NAV_ITEMS = [
  { id: "inicio", label: "Início" },
  { id: "quem-e-rafael", label: "Quem é Rafael" },
  { id: "a-analise", label: "A análise" },
  { id: "como-funciona", label: "Como funciona" },
  { id: "areas-atuacao", label: "Áreas de atuação" },
  { id: "depoimentos", label: "Depoimentos" },
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
    // Barra de navegação -- container intencionalmente mais largo
    // (max-w-7xl) que o das seções de conteúdo (max-w-5xl, ver
    // Footer/Hero/etc.): com max-w-5xl (1024px) a área útil pros 6
    // itens do menu + logo + CTA nunca passava de ~976px, o que
    // forçava quebra de linha em QUALQUER largura de tela >=1024px
    // (a barra nunca crescia além dos 1024px do container, mesmo em
    // monitores de 1920px). É a causa raiz do menu quebrando em
    // 1280/1366/1440/1920px.
    //
    // O breakpoint do menu desktop é xl (1280px), não lg (1024px):
    // medido de verdade no navegador, a barra completa (logo + 6 itens
    // + CTA, sem encolher nenhum deles) precisa de ~1075px só de
    // conteúdo -- em 1024px o container só tem ~1009px úteis, e como
    // cada item tem shrink-0 (pra nunca quebrar texto em 2 linhas), o
    // excesso vira ROLAGEM HORIZONTAL em vez de quebra de linha, o que
    // é pior. xl (1280px) é o primeiro breakpoint em que sobra espaço
    // de verdade. Entre 768px e 1279px aparece o menu mobile
    // (hamburguer), que sempre teve espaço de sobra.
    <nav className="sticky top-0 z-50 bg-navy/95 backdrop-blur text-white" aria-label="Navegação principal">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 px-6 py-3">
        <a
          href="#inicio"
          onClick={() => handleNavClick("inicio")}
          className="font-bold tracking-wide whitespace-nowrap text-sm xl:text-base shrink-0"
        >
          {site.nome} <span className="text-gold font-normal">| Hipnoterapeuta</span>
        </a>

        <div className="hidden xl:flex items-center gap-4 text-sm">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={() => handleNavClick(item.id)}
              aria-current={active === item.id ? "true" : undefined}
              className={`pb-1 border-b-2 whitespace-nowrap shrink-0 transition hover:text-gold ${
                active === item.id ? "text-gold border-gold" : "opacity-85 border-transparent"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>

        <Link
          href={ctaAgendar.href}
          className="hidden xl:inline-block bg-gold text-[#1b1200] px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap shrink-0 hover:-translate-y-0.5 transition"
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
          className="xl:hidden text-2xl leading-none p-2 -mr-2"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {mobileOpen && (
        <div
          id="menu-mobile"
          className="xl:hidden bg-navy-dark border-t border-white/10 px-6 py-4 space-y-1 max-h-[calc(100vh-56px)] overflow-y-auto"
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
