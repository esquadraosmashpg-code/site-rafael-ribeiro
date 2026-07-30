import LegalPage from "@/components/LegalPage";

export const metadata = { title: "Política de Cookies" };

export default function Page() {
  return (
    <LegalPage titulo="Política de Cookies" atualizado="Julho de 2026">
      <p>
        Este site pode usar cookies e tecnologias semelhantes para melhorar sua experiência de
        navegação e medir o desempenho de campanhas de marketing.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">Tipos de cookies utilizados</h2>
      <p>
        Cookies essenciais (necessários para o funcionamento do site) e cookies de análise/publicidade
        (como Google Analytics e Meta Pixel), usados para entender como os visitantes usam o site e
        medir a eficácia de anúncios.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">Como gerenciar cookies</h2>
      <p>
        Você pode desativar cookies diretamente nas configurações do seu navegador. Isso pode
        afetar algumas funcionalidades do site.
      </p>
    </LegalPage>
  );
}
