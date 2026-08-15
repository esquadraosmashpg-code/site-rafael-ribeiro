// Config central do site — trocar este arquivo (+ paleta em globals.css + foto em /public)
// e uma boa parte do trabalho de white-label para outro profissional já está feito.

export const site = {
  nome: "Rafael Ribeiro",
  titulo: "Rafael Ribeiro — Hipnoterapeuta",
  instagram: "@rafaelribeirohipnoterapeuta",
  whatsappNumero: "5511933270931", // TEMP: numero da Smash Midias para testes - trocar pelo numero do Dr. Rafael antes de divulgar
  agendaPath: "/agendar", // Agenda propria (Google Calendar + Meet), integrada ao site
  localizacaoTexto: "Localização e horários", // título da seção/coluna que mostra o endereço (ver `endereco` abaixo)
};

// Endereço do consultório — importado do arquivo neutro
// config/location.js, que é a fonte ÚNICA de verdade (também importado
// por config/booking.js, sem que um dos dois dependa do outro).
// Reexportado aqui só para não quebrar quem já importa `endereco` de
// "@/config/content" (Footer.js, FAQ abaixo, testes).
import { endereco } from "./location.js";
export { endereco };

// Rótulo/URL do CTA principal do site inteiro. Um lugar só — se o texto
// mudar de novo, muda aqui e reflete em todo canto que importar isso.
export const ctaAgendar = {
  texto: "Agende sua análise",
  href: "/agendar",
};

export const hero = {
  headline: ["Transforme sua mente.", "Supere bloqueios.", "Viva com mais liberdade emocional."],
  subheadline: "Eu te ajudo a parar de perder tempo, dinheiro e saúde com o que te machuca por dentro. Atendimento humano, conduzido por tecnologia.",
  // O primeiro passo é sempre a análise — nunca a promessa de resultado.
  primeiroPasso: "O primeiro passo é uma análise do seu caso com o Dr. Rafael.",
  ctaPrincipal: ctaAgendar.texto,
  ctaSecundarioTexto: "Conhecer o processo",
  ctaSecundarioAlvo: "a-analise",
  triagem: [
    { emoji: "🧠", texto: "Quero saber mais sobre Hipnoterapia", acao: "scroll", alvo: "hipnoterapia" },
    { emoji: "📋", texto: "Quero entender como funciona a análise", acao: "scroll", alvo: "a-analise" },
    { emoji: "💬", texto: "Quero falar com o Dr. Rafael", acao: "chat" },
  ],
};

// "Quem é Rafael" — mesma trajetória já publicada no site, só organizada
// em blocos (trajetória / abordagem / propósito) em vez de um parágrafo
// só. Nenhum fato novo: formação, número de atendimentos, certificação ou
// depoimento NÃO devem ser adicionados aqui sem confirmação do Rafael.
export const sobre = {
  titulo: "Quem é Rafael Ribeiro?",
  paragrafo: "Mestre em Engenharia Civil — um caminho que, a princípio, nada tinha a ver com terapia. Ele encontrou sua missão ao resolver os próprios traumas, e decidiu dedicar a vida a ajudar outras pessoas a fazerem o mesmo. Hoje é casado e pai de duas filhas.",
  citacao: "Não nasci nisso. Encontrei minha missão quando resolvi meus próprios traumas — e hoje dedico minha vida a ajudar outras pessoas a fazerem o mesmo. Sou mestre em Engenharia Civil, marido e pai de duas filhas. E é essa jornada pessoal que me trouxe até aqui.",
  blocos: [
    {
      titulo: "Trajetória",
      texto:
        "Formado mestre em Engenharia Civil, um caminho que não tinha relação nenhuma com terapia. A virada aconteceu quando ele próprio precisou resolver seus traumas — e, nesse processo, encontrou o trabalho que faz hoje.",
    },
    {
      titulo: "Abordagem",
      texto:
        "Conduz cada atendimento de forma humana e estruturada: primeiro entende o contexto da pessoa, explica como o processo funciona, e só então define os próximos passos junto com ela.",
    },
    {
      titulo: "Propósito",
      texto:
        "Depois de reconstruir a própria história, decidiu dedicar a vida a ajudar outras pessoas a fazerem o mesmo — hoje é casado, pai de duas filhas, e é essa jornada pessoal que sustenta o trabalho.",
    },
  ],
  cta: "Conheça minha metodologia",
};

// "A análise" — primeiro atendimento (nome formal do serviço: "Análise
// inicial"). Preço/duração/sinal/saldo e política de remarcação são as
// regras operacionais confirmadas pelo Rafael (ver config/booking.js pra
// duração e horários fixos usados de verdade na agenda -- os valores
// abaixo têm que bater com os de lá; ver teste em
// tests/navegacaoConversao.test.js que checa essa consistência).
export const analise = {
  nomeServico: "Análise inicial",
  titulo: "O primeiro passo é a análise",
  intro:
    "Antes de qualquer tratamento, o atendimento começa com uma análise — o primeiro encontro com o Dr. Rafael.",
  objetivos: [
    "Compreender o contexto que você traz.",
    "Explicar como funciona a abordagem, de forma clara.",
    "Avaliar, com honestidade, se esse atendimento é adequado pro seu caso.",
    "Definir junto com você os próximos passos.",
  ],
  fechamento:
    "Só ao final da análise — não antes — é apresentada a recomendação, o intervalo estimado e o valor do tratamento, caso ele seja indicado. Não há promessa de cura ou resultado garantido: cada processo é individual.",
  valor: "R$ 350,00",
  duracao: "1h30",
  sinal: "R$ 150,00",
  sinalTexto: "Sinal para reservar o horário",
  saldo: "R$ 200,00",
  saldoTexto: "Saldo pago no dia da análise",
  modalidades: {
    online: "Atendimento online, por videochamada.",
    presencialDisponivel: "Atendimento presencial também disponível.",
    presencialIndisponivel: "Atendimento presencial em breve — por enquanto, só online.",
  },
  // Redação revisada: nunca insinuar que existe cancelamento (com ou sem
  // devolução) -- a regra comercial é que cancelamento simplesmente não é
  // admitido. Frase exata confirmada.
  politica: {
    titulo: "Política de remarcação",
    itens: [
      "O agendamento não admite cancelamento. A remarcação pode ser solicitada com antecedência mínima de 48 horas.",
    ],
    notaDiscreta: "As condições completas serão apresentadas antes da confirmação.",
  },
  // Texto do checkbox comercial obrigatório em /agendar (separado do
  // checkbox de Política de Privacidade) -- frase exata confirmada.
  checkboxComercial:
    "Li e concordo com as condições de agendamento, incluindo o sinal de R$ 150,00 e a regra de remarcação com antecedência mínima de 48 horas.",
  cta: ctaAgendar.texto,
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
  {
    q: "É presencial?",
    a: `Pode ser presencial ou online — você escolhe durante o agendamento. O consultório fica em ${endereco.textoCompleto}.`,
  },
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
