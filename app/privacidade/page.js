import LegalPage from "@/components/LegalPage";

export const metadata = { title: "Política de Privacidade" };

export default function Page() {
  return (
    <LegalPage titulo="Política de Privacidade" atualizado="Julho de 2026">
      <p>
        Esta Política de Privacidade explica como coletamos, usamos, armazenamos e protegemos
        os dados fornecidos por você ao usar este site, incluindo o pré-atendimento feito pela
        Secretária Virtual.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">1. Quais dados coletamos</h2>
      <p>
        Nome, idade, cidade, telefone, motivo do contato e demais respostas fornecidas
        voluntariamente durante o pré-atendimento. Esses dados podem incluir informações sobre
        saúde emocional, consideradas dados sensíveis pela Lei Geral de Proteção de Dados (LGPD).
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">2. Para que usamos esses dados</h2>
      <p>
        Exclusivamente para viabilizar o seu atendimento: organizar o pré-atendimento, contatar
        você por WhatsApp ou e-mail, e permitir que o profissional avalie seu caso antes da
        consulta.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">3. Com quem compartilhamos</h2>
      <p>
        Seus dados não são vendidos ou compartilhados com terceiros para fins de marketing.
        Podem ser processados por fornecedores de infraestrutura (hospedagem, agenda, WhatsApp)
        estritamente para operar o serviço.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">4. Seus direitos</h2>
      <p>
        Você pode solicitar a qualquer momento a confirmação, correção, portabilidade ou exclusão
        dos seus dados, entrando em contato pelo WhatsApp informado no rodapé do site.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">5. Segurança</h2>
      <p>
        Adotamos medidas técnicas razoáveis para proteger seus dados contra acesso não autorizado,
        perda ou alteração.
      </p>
    </LegalPage>
  );
}
