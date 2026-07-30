import LegalPage from "@/components/LegalPage";

export const metadata = { title: "Termos de Uso" };

export default function Page() {
  return (
    <LegalPage titulo="Termos de Uso" atualizado="Julho de 2026">
      <p>
        Ao utilizar este site e a Secretária Virtual, você concorda com os termos abaixo.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">Natureza do serviço</h2>
      <p>
        Este site oferece informações sobre Hipnoterapia e um canal de pré-atendimento. Ele não
        substitui diagnóstico ou tratamento médico/psiquiátrico. Em caso de emergência ou risco à
        vida, procure imediatamente o Serviço de Atendimento Móvel de Urgência (192) ou o Centro de
        Valorização da Vida (188).
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">Responsabilidades</h2>
      <p>
        As informações fornecidas no pré-atendimento devem ser verdadeiras. O profissional se
        reserva o direito de avaliar cada caso antes de confirmar o atendimento.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">Propriedade intelectual</h2>
      <p>
        Todo o conteúdo deste site (textos, imagens, identidade visual) pertence a Rafael Ribeiro
        e/ou à Smash Mídias, sendo vedada a reprodução sem autorização.
      </p>
    </LegalPage>
  );
}
