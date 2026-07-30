// Config central do site — trocar este arquivo (+ paleta em globals.css + foto em /public)
// e uma boa parte do trabalho de white-label para outro profissional já está feito.

export const site = {
  nome: "Rafael Ribeiro",
  titulo: "Rafael Ribeiro — Hipnoterapeuta",
  instagram: "@rafaelribeirohipnoterapeuta",
  whatsappNumero: "5511933270931", // TEMP: numero da Smash Midias para testes - trocar pelo numero do Dr. Rafael antes de divulgar
  calLink: "https://cal.com/kennedy-alves-pinto-cusgm6/30min", // TEMP: agenda de teste - trocar pela do Dr. Rafael antes de divulgar
};

export const hero = {
  headline: ["Transforme sua mente.", "Supere bloqueios.", "Viva com mais liberdade emocional."],
  subheadline: "Eu te ajudo a parar de perder tempo, dinheiro e saúde com o que te machuca por dentro. Atendimento humano, conduzido por tecnologia.",
  ctaPrincipal: "Quero iniciar meu atendimento",
  triagem: [
    { emoji: "🧠", texto: "Quero saber mais sobre Hipnoterapia", acao: "scroll", alvo: "hipnoterapia" },
    { emoji: "📅", texto: "Quero agendar uma consulta", acao: "chat" },
    { emoji: "💬", texto: "Quero falar com o Dr. Rafael", acao: "chat" },
  ],
};

export const sobre = {
  titulo: "Quem é Rafael Ribeiro?",
  paragrafo: "Mestre em Engenharia Civil — um caminho que, a princípio, nada tinha a ver com terapia. Ele encontrou sua missão ao resolver os próprios traumas, e decidiu dedicar a vida a ajudar outras pessoas a fazerem o mesmo. Hoje é casado e pai de duas filhas.",
  citacao: "Não nasci nisso. Encontrei minha missão quando resolvi meus próprios traumas — e hoje dedico minha vida a ajudar outras pessoas a fazerem o mesmo. Sou mestre em Engenharia Civil, marido e pai de duas filhas. E é essa jornada pessoal que me trouxe até aqui.",
  cta: "Conheça minha metodologia",
};

export const passosHipnoterapia = [
  "O cérebro cria padrões.",
  "A Hipnoterapia identifica esses padrões.",
  "Substituímos crenças limitantes.",
  "Você conquista novos resultados.",
];

// Áreas de atuação reais (base: Instagram do Dr. Rafael)
// Nota de compliance: a linguagem de "Ansiedade e depressão" é intencionalmente
// enquadrada como apoio complementar — ver seção 4 da proposta estratégica
// sobre a alegação de "tentativa de suicídio" que NÃO deve ir para o site assim.
export const areasAtuacao = [
  { titulo: "Ansiedade e depressão", texto: "Apoio complementar ao tratamento — sempre em conjunto com acompanhamento psicológico/psiquiátrico quando necessário." },
  { titulo: "Dependência emocional", texto: "Para quem não consegue mais confiar ou se sente preso em relacionamentos conturbados." },
  { titulo: "Traumas e mágoas reprimidas", texto: "Identificar e ressignificar experiências que ainda travam o presente." },
  { titulo: "Baixa autoestima", texto: "Reconstruir a relação consigo mesmo." },
  { titulo: "Fobias específicas", texto: "Agulha, ambientes fechados, sensação de estar preso, entre outras." },
  { titulo: "Compulsões", texto: "Alimentar, por compras ou sexual." },
  { titulo: "Síndrome do pânico", texto: "Reduzir crises e recuperar a sensação de segurança." },
  { titulo: "Fibromialgia", texto: "Dores associadas a fatores emocionais." },
  { titulo: "Crenças financeiras limitantes", texto: "Padrões inconscientes que sabotam sua relação com dinheiro." },
  { titulo: "Histórico de abuso", texto: "Processo conduzido com cuidado e sigilo." },
];

export const timeline = [
  { titulo: "Primeiro contato", texto: "Você chega até nós" },
  { titulo: "Pré-atendimento", texto: "Secretária Virtual qualifica seu caso" },
  { titulo: "Análise", texto: "Dr. Rafael avalia seu contexto" },
  { titulo: "Consulta", texto: "Primeira sessão, presencial ou online" },
  { titulo: "Plano terapêutico", texto: "Estratégia personalizada" },
  { titulo: "Acompanhamento", texto: "Evolução contínua" },
];

export const faqs = [
  { q: "Hipnose funciona?", a: "Sim. É um estado natural de foco e relaxamento profundo, usado como ferramenta para acessar e ressignificar padrões mentais." },
  { q: "Vou dormir?", a: "Não. Você permanece consciente e no controle durante todo o processo." },
  { q: "É seguro?", a: "Sim, quando conduzido por um profissional qualificado, como parte de um processo terapêutico estruturado." },
  { q: "Quantas sessões?", a: "Varia conforme o caso — isso é definido na consulta de avaliação." },
  { q: "É presencial?", a: "Pode ser presencial ou online, conforme sua preferência." },
  { q: "É online?", a: "Sim, atendimento online também está disponível." },
];

// Fluxo da Secretária Virtual (Fase 1 — fluxo guiado, sem custo de IA generativa)
// key: identifica a resposta no resumo final
// type: "text" (input livre) ou "chips" (opções clicáveis)
// safety: true = pergunta que aciona o protocolo de segurança se resposta indicar risco
export const chatFlow = [
  { key: "nome", bot: "Olá 😊 Sou a assistente virtual do Dr. Rafael. Vou fazer algumas perguntas rápidas para agilizar seu atendimento. Leva menos de 3 minutos.\n\nPara começar, qual o seu nome?", type: "text" },
  { key: "idade", bot: "Prazer! Qual sua idade?", type: "text" },
  { key: "cidade", bot: "De qual cidade você fala?", type: "text" },
  { key: "telefone", bot: "Qual seu telefone com WhatsApp?", type: "text" },
  { key: "motivo", bot: "Qual o principal motivo do seu contato?", type: "chips", options: ["Ansiedade", "Medos", "Traumas", "Autoestima", "Relacionamentos", "Compulsão", "Outro"] },
  { key: "tempo", bot: "Há quanto tempo isso acontece?", type: "chips", options: ["Menos de 1 mês", "Alguns meses", "Mais de 1 ano"] },
  { key: "ja_fez", bot: "Já realizou Hipnoterapia antes?", type: "chips", options: ["Sim", "Não"] },
  { key: "como_conheceu", bot: "Como você conheceu o Dr. Rafael?", type: "chips", options: ["Instagram", "Google", "Indicação", "Facebook", "Outro"] },
  { key: "horario", bot: "Qual horário você prefere?", type: "chips", options: ["Manhã", "Tarde", "Noite"] },
  { key: "modalidade", bot: "Você deseja atendimento:", type: "chips", options: ["Online", "Presencial"] },
];

export const chatLabels = {
  nome: "Nome", idade: "Idade", cidade: "Cidade", telefone: "Telefone", motivo: "Motivo",
  tempo: "Duração", ja_fez: "Já fez hipnoterapia", como_conheceu: "Como conheceu",
  horario: "Horário preferido", modalidade: "Modalidade",
};
