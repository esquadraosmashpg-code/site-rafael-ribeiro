"use client";
import { useState } from "react";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Sobre from "@/components/Sobre";
import HipnoterapiaSteps from "@/components/HipnoterapiaSteps";
import Analise from "@/components/Analise";
import ParaQuemCards from "@/components/ParaQuemCards";
import Timeline from "@/components/Timeline";
import Depoimentos from "@/components/Depoimentos";
import SecretariaCTA from "@/components/SecretariaCTA";
import Faq from "@/components/Faq";
import CTAFinal from "@/components/CTAFinal";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";
import MobileCTA from "@/components/MobileCTA";

export default function Home() {
  const [chatOpen, setChatOpen] = useState(false);
  const openChat = () => setChatOpen(true);
  const closeChat = () => setChatOpen(false);

  return (
    <>
      <Nav />
      <Hero onOpenChat={openChat} />
      <Sobre />
      <HipnoterapiaSteps />
      <Analise />
      <Timeline />
      <ParaQuemCards />
      {/* Prova social posicionada aqui (depois de "Áreas de atuação", antes
          da FAQ/CTA final) em vez de logo após "Como funciona": encaixa
          melhor na narrativa da página -- como funciona -> pra quem é ->
          depoimentos reais -> tira dúvidas -> chamada final -- do que
          interromper a ponte entre Timeline e ParaQuemCards. Continua
          "depois de Como funciona e antes do CTA principal (CTAFinal)",
          como pedido. */}
      <Depoimentos />
      <Faq />
      <SecretariaCTA onOpenChat={openChat} />
      <CTAFinal />
      <Footer />
      {/* Reserva espaço pro CTA fixo mobile não cobrir o rodapé quando a
          página rola até o fim -- só existe em telas pequenas. */}
      <div className="md:hidden h-20" aria-hidden="true" />
      <MobileCTA />
      <ChatWidget open={chatOpen} onClose={closeChat} />
    </>
  );
}
