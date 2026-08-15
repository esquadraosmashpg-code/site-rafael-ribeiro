import LegalPage from "@/components/LegalPage";

export const metadata = { title: "Política de Cookies" };

export default function Page() {
  return (
    <LegalPage titulo="Política de Cookies" atualizado="Agosto de 2026">
      <p>
        Este site usa apenas cookies estritamente necessários para o funcionamento de algumas
        áreas. Não usamos cookies de publicidade, rastreamento entre sites ou medição de
        campanhas de marketing.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">Cookies que usamos</h2>
      <p>
        <b>Sessão do painel administrativo:</b> quando o profissional (ou responsável técnico)
        faz login na área administrativa do site, um cookie essencial mantém essa sessão
        autenticada enquanto o painel está em uso. Ele é apagado automaticamente ao sair e expira
        sozinho depois de um tempo curto. Esse cookie não é usado para identificar ou rastrear
        visitantes comuns do site — só existe pra quem efetivamente faz login no painel.
      </p>
      <p>
        <b>Cookie técnico de configuração:</b> durante a configuração pontual da integração com o
        Google Calendar (processo interno, de uso exclusivo da equipe técnica, não acessível ao
        público), um cookie temporário de segurança pode ser criado só durante essa etapa
        específica.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">O que não usamos</h2>
      <p>
        Não usamos Google Analytics, Meta Pixel nem qualquer outra ferramenta de análise de
        audiência ou publicidade neste momento. Se isso mudar no futuro, esta política será
        atualizada antes de qualquer ativação.
      </p>
      <h2 className="text-navy font-bold text-lg pt-2">Como gerenciar cookies</h2>
      <p>
        Você pode bloquear ou apagar cookies diretamente nas configurações do seu navegador. Como
        usamos apenas cookies essenciais, isso não afeta a navegação pelo site nem o
        pré-atendimento — só pode impedir o funcionamento do painel administrativo, que não é
        usado por pacientes.
      </p>
    </LegalPage>
  );
}
