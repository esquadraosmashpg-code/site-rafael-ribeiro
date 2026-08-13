import AgendaHeader from "@/components/agendar/AgendaHeader";
import AgendarFlow from "@/components/agendar/AgendarFlow";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Agendar consulta — Rafael Ribeiro Hipnoterapeuta",
  description: "Agende sua consulta online ou presencial com o Dr. Rafael Ribeiro.",
};

export default function AgendarPage() {
  return (
    <>
      <AgendaHeader />
      <AgendarFlow />
      <Footer />
    </>
  );
}
