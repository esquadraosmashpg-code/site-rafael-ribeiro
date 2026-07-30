import LegalPage from "@/components/LegalPage";

export const metadata = { title: "LGPD" };

export default function Page() {
  return (
    <LegalPage titulo="LGPD — Lei Geral de Proteção de Dados" atualizado="Julho de 2026">
      <p>
        Este site trata dados pessoais em conformidade com a Lei nº 13.709/2018 (LGPD).
        Como o pré-atendimento pode envolver informações sobre saúde emocional, tratamos esses
        dados como dados pessoais sensíveis (Art. 5º, II e Art. 11 da LGPD), com cuidado adicional.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">Base legal para o tratamento</h2>
      <p>
        O tratamento dos seus dados se baseia no seu consentimento explícito, fornecido ao
        preencher o pré-atendimento, e na necessidade de execução do serviço solicitado por você
        (agendamento e atendimento terapêutico).
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">Encarregado de dados (DPO)</h2>
      <p>
        Para exercer seus direitos previstos na LGPD (acesso, correção, exclusão, portabilidade,
        revogação de consentimento), entre em contato pelo WhatsApp informado no rodapé do site.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">Retenção e exclusão</h2>
      <p>
        Seus dados são mantidos apenas pelo tempo necessário para a prestação do serviço e
        cumprimento de obrigações legais, podendo ser excluídos a qualquer momento mediante
        solicitação, salvo obrigação legal de retenção.
      </p>
    </LegalPage>
  );
}
