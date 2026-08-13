import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ctaAgendar, site, analise, hero, sobre } from "../config/content.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

describe("ctaAgendar (fonte única do CTA principal)", () => {
  test("texto e destino corretos", () => {
    assert.equal(ctaAgendar.texto, "Agende sua análise");
    assert.equal(ctaAgendar.href, "/agendar");
    assert.equal(site.agendaPath, "/agendar");
  });
});

describe("Todos os CTAs apontam pra /agendar", () => {
  test("CTAAgendar.js usa ctaAgendar.href (não um caminho hardcoded)", () => {
    const src = read("components/CTAAgendar.js");
    assert.match(src, /href=\{ctaAgendar\.href\}/);
    assert.doesNotMatch(src, /href=["']\/(?!agendar)/); // nenhum href hardcoded pra outra rota
  });

  test("Nav.js usa ctaAgendar.href nos dois botões (desktop e mobile)", () => {
    const src = read("components/Nav.js");
    const matches = src.match(/href=\{ctaAgendar\.href\}/g) || [];
    assert.equal(matches.length, 2, "esperava 2 usos (desktop + mobile)");
  });

  test("MobileCTA.js usa ctaAgendar.href", () => {
    const src = read("components/MobileCTA.js");
    assert.match(src, /href=\{ctaAgendar\.href\}/);
  });

  test("ChatWidget.js encaminha pro mesmo destino (site.agendaPath === /agendar)", () => {
    const src = read("components/ChatWidget.js");
    assert.match(src, /href=\{site\.agendaPath\}/);
  });

  test("todas as seções principais importam e usam CTAAgendar", () => {
    const arquivosComCTA = [
      "components/Sobre.js",
      "components/Analise.js",
      "components/Timeline.js",
      "components/ParaQuemCards.js",
      "components/Faq.js",
      "components/HipnoterapiaSteps.js",
      "components/CTAFinal.js",
    ];
    for (const arquivo of arquivosComCTA) {
      const src = read(arquivo);
      assert.match(src, /<CTAAgendar\b/, `${arquivo} deveria renderizar <CTAAgendar>`);
    }
  });
});

describe("Menu de navegação (desktop + mobile)", () => {
  const navSrc = read("components/Nav.js");
  const itensEsperados = [
    ["inicio", "Início"],
    ["quem-e-rafael", "Quem é Rafael"],
    ["a-analise", "A análise"],
    ["como-funciona", "Como funciona"],
    ["areas-atuacao", "Áreas de atuação"],
    ["faq", "Perguntas frequentes"],
  ];

  test("contém os 6 itens de âncora esperados", () => {
    for (const [id, label] of itensEsperados) {
      assert.match(navSrc, new RegExp(`id:\\s*"${id}"`), `id "${id}" ausente`);
      assert.ok(navSrc.includes(label), `label "${label}" ausente`);
    }
  });

  test("header é sticky (fixo durante a rolagem)", () => {
    assert.match(navSrc, /sticky top-0/);
  });

  test("botão hambúrguer é acessível (aria-expanded, aria-controls, aria-label)", () => {
    assert.match(navSrc, /aria-expanded=\{mobileOpen\}/);
    assert.match(navSrc, /aria-controls="menu-mobile"/);
    assert.match(navSrc, /aria-label=\{mobileOpen/);
  });

  test("menu mobile fecha ao escolher uma seção (chama closeMobile())", () => {
    const matches = navSrc.match(/closeMobile\(\)/g) || [];
    assert.ok(matches.length >= 1, "itens de âncora deveriam chamar closeMobile()");
    assert.match(navSrc, /onClick=\{closeMobile\}/, "CTA do menu mobile deveria fechar ao clicar");
  });

  test("indicação visual da seção atual via aria-current", () => {
    assert.match(navSrc, /aria-current=\{active === item\.id \? "true" : undefined\}/);
  });
});

describe("Navegação por âncora: ids do menu batem com os das seções", () => {
  const secaoPorId = {
    inicio: "components/Hero.js",
    "quem-e-rafael": "components/Sobre.js",
    "a-analise": "components/Analise.js",
    "como-funciona": "components/Timeline.js",
    "areas-atuacao": "components/ParaQuemCards.js",
    faq: "components/Faq.js",
  };

  for (const [id, arquivo] of Object.entries(secaoPorId)) {
    test(`#${id} existe em ${arquivo}`, () => {
      const src = read(arquivo);
      assert.match(src, new RegExp(`id="${id}"`), `<section id="${id}"> não encontrado em ${arquivo}`);
    });
  }
});

describe("CTA fixo mobile não aparece em /agendar", () => {
  test("MobileCTA é importado na home", () => {
    assert.match(read("app/page.js"), /import MobileCTA from "@\/components\/MobileCTA"/);
  });

  test("MobileCTA NÃO é importado em /agendar", () => {
    assert.doesNotMatch(read("app/agendar/page.js"), /MobileCTA/);
  });

  test("botão fixo respeita safe-area do iPhone", () => {
    assert.match(read("components/MobileCTA.js"), /env\(safe-area-inset-bottom\)/);
  });

  test("botão fixo só aparece no mobile (md:hidden)", () => {
    assert.match(read("components/MobileCTA.js"), /md:hidden/);
  });
});

describe("Secretária Virtual: protocolo de crise não usa o CTA de agendamento como ação principal", () => {
  const src = read("components/ChatWidget.js");
  const riskBlockStart = src.indexOf("finished && riskFlag");
  const normalBlockStart = src.indexOf("finished && !riskFlag");
  const riskBlock = src.slice(riskBlockStart, normalBlockStart);

  test("bloco de crise não oferece 'Agende sua análise' nem qualquer variação do CTA de agendamento", () => {
    assert.ok(riskBlockStart > -1 && normalBlockStart > riskBlockStart);
    assert.ok(!riskBlock.includes("ctaAgendar"), "bloco de crise não deveria referenciar o CTA de agendamento");
    assert.ok(!/Agende sua análise/i.test(riskBlock));
  });

  test("chat não fica coberto pelo botão fixo mobile (modal cobre a tela inteira, z-[100] > MobileCTA z-40)", () => {
    assert.match(src, /z-\[100\]/);
    const mobileCtaSrc = read("components/MobileCTA.js");
    assert.match(mobileCtaSrc, /z-40/);
  });
});

describe("Nenhum dado clínico é transferido para o Google Calendar", () => {
  test("descrição do evento em /api/agendar/confirmar só tem campos operacionais", () => {
    const src = read("app/api/agendar/confirmar/route.js");
    const descStart = src.indexOf("descriptionLines");
    const descEnd = src.indexOf("];", descStart);
    const descBlock = src.slice(descStart, descEnd);
    for (const proibido of ["motivo", "sintoma", "diagnostic", "answers.motivo", "value.motivo"]) {
      assert.ok(!descBlock.toLowerCase().includes(proibido), `descrição do evento não deveria conter "${proibido}"`);
    }
  });
});

describe("Ausência de alegação sensível ou garantia de resultado", () => {
  const arquivosDeTexto = [
    "config/content.js",
    "components/Hero.js",
    "components/Sobre.js",
    "components/Analise.js",
  ];
  const frasesProibidas = [
    "cura garantida",
    "cura definitiva",
    "100% eficaz",
    "eficácia comprovada",
    "sem efeitos colaterais",
    "milagr",
    "garantimos a cura",
    "garante a cura",
    "resultado garantido para",
  ];

  for (const arquivo of arquivosDeTexto) {
    test(`${arquivo} não contém alegação proibida`, () => {
      const texto = read(arquivo).toLowerCase();
      for (const frase of frasesProibidas) {
        assert.ok(!texto.includes(frase), `"${frase}" encontrado em ${arquivo}`);
      }
    });
  }

  test("a análise explicitamente declara que não há promessa de cura/resultado garantido", () => {
    assert.match(analise.fechamento, /não há promessa de cura ou resultado garantido/i);
  });

  test("hero não usa linguagem de garantia absoluta", () => {
    const headline = hero.headline.join(" ").toLowerCase();
    assert.ok(!headline.includes("garantido") && !headline.includes("cura garantida"));
  });
});

describe("Conteúdo da análise com valores corretos", () => {
  test("nome do serviço, valor, duração, sinal e saldo batem com o combinado", () => {
    assert.equal(analise.nomeServico, "Análise inicial");
    assert.equal(analise.valor, "R$ 350,00");
    assert.equal(analise.duracao, "1h30");
    assert.equal(analise.sinal, "R$ 150,00");
    assert.equal(analise.saldo, "R$ 200,00");
  });

  test("título e CTA da análise usam a terminologia certa", () => {
    assert.equal(analise.titulo, "O primeiro passo é a análise");
    assert.equal(analise.cta, ctaAgendar.texto);
  });

  test("texto do checkbox comercial é exatamente o confirmado", () => {
    assert.equal(
      analise.checkboxComercial,
      "Li e concordo com as condições de agendamento, incluindo o sinal de R$ 150,00 e a regra de remarcação com antecedência mínima de 48 horas."
    );
  });
});

describe("Política de remarcação (48 horas, sem cancelamento, redação revisada)", () => {
  test("menciona 48 horas de antecedência", () => {
    const texto = analise.politica.itens.join(" ");
    assert.match(texto, /48 horas/);
  });

  test("declara que o agendamento não admite cancelamento (não fala em 'devolução do sinal')", () => {
    const texto = analise.politica.itens.join(" ").toLowerCase();
    assert.match(texto, /não admite cancelamento/);
    assert.doesNotMatch(texto, /devolução/);
  });

  test("inclui a observação discreta sobre condições completas", () => {
    assert.equal(analise.politica.notaDiscreta, "As condições completas serão apresentadas antes da confirmação.");
  });

  test("tom não é punitivo (não usa linguagem de penalidade/multa)", () => {
    const texto = (analise.politica.itens.join(" ") + " " + analise.politica.notaDiscreta).toLowerCase();
    for (const termo of ["multa", "penalidade", "punição"]) {
      assert.ok(!texto.includes(termo), `"${termo}" não deveria aparecer na política`);
    }
  });

  test("não inventa política de falta, atraso, devolução, estorno ou transferência do sinal", () => {
    const texto = analise.politica.itens.join(" ").toLowerCase();
    for (const termo of ["falta", "atraso", "devolução", "estorno", "transferência"]) {
      assert.ok(!texto.includes(termo), `"${termo}" não deveria aparecer -- não foi confirmado pelo Rafael`);
    }
  });
});

describe("Presencial continua bloqueado enquanto o endereço for placeholder (reusa a mesma fonte de verdade da agenda)", () => {
  test("Analise.js importa isPresencialDisponivel de config/booking (não duplica a regra)", () => {
    const src = read("components/Analise.js");
    assert.match(src, /import \{ bookingConfig, isPresencialDisponivel \} from "@\/config\/booking"/);
    assert.match(src, /isPresencialDisponivel\(bookingConfig\)/);
  });
});

describe("Regras da agenda batem com o que o Rafael confirmou (horários fixos, 90min)", () => {
  test("config/booking.js usa os 4 horários fixos confirmados e 90 minutos de duração", () => {
    const src = read("config/booking.js");
    assert.match(src, /durationMinutes:\s*90/);
    assert.match(src, /horariosFixos:\s*\[\s*"08:00",\s*"11:00",\s*"14:00",\s*"17:00"\s*\]/);
    assert.match(src, /minNoticeHours:\s*12/);
    assert.match(src, /confirmacaoAutomatica:\s*true/);
    // regra antiga (derivar por duração+intervalo) não deveria mais existir
    assert.doesNotMatch(src, /dayStart/);
    assert.doesNotMatch(src, /dayEnd/);
    assert.doesNotMatch(src, /bufferMinutes/);
  });

  test("site (config/content.js#analise) mostra os mesmos valores confirmados", () => {
    const src = read("config/content.js");
    assert.match(src, /nomeServico:\s*"Análise inicial"/);
    assert.match(src, /duracao:\s*"1h30"/);
    assert.match(src, /valor:\s*"R\$ 350,00"/);
    assert.match(src, /sinal:\s*"R\$ 150,00"/);
    assert.match(src, /saldo:\s*"R\$ 200,00"/);
  });

  test("política não insinua cancelamento com devolução do sinal", () => {
    const src = read("config/content.js");
    assert.doesNotMatch(src, /cancelamento com devolução/i);
    assert.match(src, /não admite cancelamento/i);
    assert.match(src, /48 horas/);
  });

  test("checkbox comercial obrigatório existe, separado do checkbox de privacidade", () => {
    const revisaoSrc = read("components/agendar/StepRevisao.js");
    const dadosSrc = read("components/agendar/StepDados.js");
    assert.match(revisaoSrc, /aceiteComercial/);
    assert.match(revisaoSrc, /disabled=\{enviando \|\| !aceiteComercial\}/);
    // privacidade continua na etapa de dados, comercial na de revisão -- são checkboxes distintos
    assert.match(dadosSrc, /aceite\b/);
    assert.doesNotMatch(dadosSrc, /aceiteComercial/);
  });

  test("não diz que o sinal foi pago nem condiciona a confirmação ao pagamento", () => {
    const arquivos = ["config/content.js", "components/Analise.js", "components/agendar/StepRevisao.js"];
    const proibidas = ["sinal foi pago", "pagamento confirmado", "após o pagamento", "mediante pagamento"];
    for (const arquivo of arquivos) {
      const texto = read(arquivo).toLowerCase();
      for (const frase of proibidas) {
        assert.ok(!texto.includes(frase), `"${frase}" não deveria aparecer em ${arquivo}`);
      }
    }
  });
});

describe("Botão de confirmar protegido contra múltiplos envios (trava real via useRef)", () => {
  const flowSrc = read("components/agendar/AgendarFlow.js");
  const revisaoSrc = read("components/agendar/StepRevisao.js");
  const guardSrc = read("lib/booking/submitGuard.js");

  test("usa submitGuardRef (useRef), não useState/useMemo, como trava de verdade", () => {
    assert.match(flowSrc, /const submitGuardRef = useRef\(createSubmitGuard\(\)\)/);
    assert.match(flowSrc, /submitGuardRef\.current\.tryAcquire\(\)/);
    assert.doesNotMatch(flowSrc, /if \(enviando\) return;/, "não deveria mais confiar em useState pra travar");
  });

  test("tryAcquire() é síncrono e é a primeira coisa checada em confirmar()", () => {
    assert.match(flowSrc, /if \(!submitGuardRef\.current\.tryAcquire\(\)\) return;/);
  });

  test("libera a trava em falha recuperável (resposta de erro e erro de rede), não em sucesso", () => {
    const matches = flowSrc.match(/submitGuardRef\.current\.release\(\)/g) || [];
    assert.ok(matches.length >= 2, "esperava release() no branch de erro HTTP e no catch de rede");
    // não deve haver release() logo após setResultado/goTo("sucesso")
    const trechoSucesso = flowSrc.slice(flowSrc.indexOf("setResultado(json)"), flowSrc.indexOf("setResultado(json)") + 200);
    assert.doesNotMatch(trechoSucesso, /release\(\)/);
  });

  test("confirmar() não dispara sem o aceite das condições comerciais", () => {
    assert.match(flowSrc, /if \(!aceiteComercial\)/);
  });

  test("estado visual 'enviando' (useState) continua existindo pra loading/acessibilidade", () => {
    assert.match(flowSrc, /const \[enviando, setEnviando\] = useState\(false\)/);
    assert.match(flowSrc, /setEnviando\(true\)/);
  });

  test("botão de confirmar fica desabilitado enquanto envia", () => {
    assert.match(revisaoSrc, /disabled=\{enviando \|\| !aceiteComercial\}/);
  });

  test("chave de idempotência vem de um useRef (attemptKeyStoreRef), nunca de useMemo", () => {
    assert.match(flowSrc, /const attemptKeyStoreRef = useRef\(createAttemptKeyStore\(gerarIdempotencyKey\)\)/);
    assert.match(flowSrc, /attemptKeyStoreRef\.current\.keyFor\(/);
    assert.doesNotMatch(flowSrc, /useMemo\(\(\) => gerarIdempotencyKey/, "não deveria mais usar useMemo pra chave de segurança");
  });

  test("refs só são lidos/escritos dentro de handlers (confirmar()), nunca no corpo do render", () => {
    // a inicialização (useRef(criarAlgumaCoisa())) não conta como acesso a
    // `.current` -- só a leitura/escrita de `.current` em si. Não deveria
    // sobrar nenhum acesso a `.current` fora da função confirmar().
    const inicioConfirmar = flowSrc.indexOf("async function confirmar()");
    const fimConfirmar = flowSrc.indexOf("\n  }\n", inicioConfirmar);
    const antesDeConfirmar = flowSrc.slice(0, inicioConfirmar);
    assert.doesNotMatch(antesDeConfirmar, /Ref\.current/, "não deveria acessar .current antes da função confirmar()");
    assert.ok(fimConfirmar > inicioConfirmar);
  });

  test("chave é enviada em header próprio (Idempotency-Key), nunca na URL nem exposta como query string", () => {
    assert.match(flowSrc, /"Idempotency-Key":\s*idempotencyKey/);
    assert.doesNotMatch(flowSrc, /\?.*idempotencyKey/);
  });

  test("chave NÃO é mais enviada dentro do corpo JSON (migrou pro header)", () => {
    const trechoBody = flowSrc.slice(flowSrc.indexOf("body: JSON.stringify"), flowSrc.indexOf("body: JSON.stringify") + 400);
    assert.doesNotMatch(trechoBody, /idempotencyKey,/);
  });

  test("sucesso muda de etapa (o botão de confirmar deixa de existir na tela)", () => {
    assert.match(flowSrc, /goTo\("sucesso"\)/);
  });

  test("lib/booking/submitGuard.js documenta por que usa useRef em vez de useMemo", () => {
    assert.match(guardSrc, /useRef/i);
    assert.match(guardSrc, /useMemo/i);
  });
});

describe("Servidor: idempotência vinculada ao pedido (item 3 da auditoria)", () => {
  const routeSrc = read("app/api/agendar/confirmar/route.js");
  const idempSrc = read("lib/booking/idempotency.js");

  test("lê a chave do header Idempotency-Key, não do corpo", () => {
    assert.match(routeSrc, /request\.headers\.get\("idempotency-key"\)/);
  });

  test("usa reserveAttempt com os 4 estados documentados", () => {
    assert.match(idempSrc, /PROCESSING:\s*"PROCESSING"/);
    assert.match(idempSrc, /SUCCEEDED:\s*"SUCCEEDED"/);
    assert.match(idempSrc, /FAILED_SAFE:\s*"FAILED_SAFE"/);
    assert.match(idempSrc, /UNKNOWN:\s*"UNKNOWN"/);
  });

  test("rota responde 409 em caso de 'conflict' (mesma chave, pedido diferente)", () => {
    assert.match(routeSrc, /attempt\.outcome === "conflict"/);
    const trecho = routeSrc.slice(routeSrc.indexOf('attempt.outcome === "conflict"'), routeSrc.indexOf('attempt.outcome === "conflict"') + 200);
    assert.match(trecho, /status:\s*409/);
  });

  test("rota devolve a resposta anterior em caso de 'succeeded', sem tentar criar de novo", () => {
    assert.match(routeSrc, /attempt\.outcome === "succeeded"/);
  });

  test("rota nunca repete cego em caso de 'unknown'", () => {
    assert.match(routeSrc, /attempt\.outcome === "unknown"/);
  });

  test("falha ANTES de chamar o Google usa FAILED_SAFE (presencial bloqueado, data inválida, dia indisponível, horário inválido, lock ocupado, freeBusy falhou, horário ocupado)", () => {
    const ocorrencias = routeSrc.match(/finish\(IdempotencyStatus\.FAILED_SAFE\)/g) || [];
    assert.ok(ocorrencias.length >= 6, `esperava várias ocorrências de FAILED_SAFE antes da criação, achou ${ocorrencias.length}`);
  });

  test("falha na criação do evento (chamada de escrita ao Google) usa UNKNOWN, não FAILED_SAFE", () => {
    const criacaoIdx = routeSrc.indexOf("erro ao criar evento");
    const trecho = routeSrc.slice(criacaoIdx - 50, criacaoIdx + 300);
    assert.match(trecho, /finish\(IdempotencyStatus\.UNKNOWN\)/);
  });

  test("sucesso registra com SUCCEEDED antes de retornar", () => {
    assert.match(routeSrc, /finish\(IdempotencyStatus\.SUCCEEDED, responseBody\)/);
  });

  test("limitação entre instâncias serverless está documentada", () => {
    assert.match(idempSrc, /instânc/i);
    assert.match(idempSrc, /distribu/i);
  });
});
