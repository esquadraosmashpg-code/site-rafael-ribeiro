"use client";
import { useState } from "react";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Sobre from "@/components/Sobre";
import HipnoterapiaSteps from "@/components/HipnoterapiaSteps";
import ParaQuemCards from "@/components/ParaQuemCards";
import Timeline from "@/components/Timeline";
import SecretariaCTA from "@/components/SecretariaCTA";
import Faq from "@/components/Faq";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";

export default function Home() {
  const [chatOpen, setChatOpen] = useState(false);
  const openChat = () => setChatOpen(true);
  const closeChat = () => setChatOpen(false);

  return (
    <>
      <Nav onOpenChat={openChat} />
      <Hero onOpenChat={openChat} />
      <Sobre />
      <HipnoterapiaSteps />
      <ParaQuemCards />
      <Timeline />
      <SecretariaCTA onOpenChat={openChat} />
      <Faq />
      <Footer />
      <ChatWidget open={chatOpen} onClose={closeChat} />
    </>
  );
}
