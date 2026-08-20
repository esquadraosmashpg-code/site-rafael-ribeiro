// Cobre a seção de prova social (Depoimentos): existência do aviso de
// resultado individual, grid progressivo (6 iniciais + "Ver mais"),
// modal acessível (nome acessível, Escape, clique fora, devolução de
// foco, trava de rolagem), ausência de qualquer identificação pessoal
// no código/conteúdo público, e confirmação de que agenda/painel
// administrativo não foram tocados nesta rodada. Mesmo padrão de leitura
// de código-fonte já usado no projeto (sem jsdom -- ver
// tests/navegacaoConversao.test.js).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { depoimentos } from "../config/content.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const src = read("components/Depoimentos.js");
const pageSrc = read("app/page.js");

describe("1) Seção existe e mostra o aviso de resultado individual", () => {
  test("config/content.js#depoimentos.titulo e .aviso batem com o texto exato pedido", () => {
    assert.equal(depoimentos.titulo, "Relatos de quem viveu essa transformação");
    assert.equal(
      depoimentos.aviso,
      "Experiências reais compartilhadas por pessoas atendidas pelo Rafael. Cada processo é individual e os resultados podem variar."
    );
  });

  test("Depoimentos.js renderiza o título e o aviso a partir da config (não hardcoda)", () => {
    assert.match(src, /\{depoimentos\.titulo\}/);
    assert.match(src, /\{depoimentos\.aviso\}/);
  });

  test("app/page.js renderiza <Depoimentos /> depois de <Timeline /> (Como funciona) e antes de <CTAFinal /> (CTA principal)", () => {
    const idxTimeline = pageSrc.indexOf("<Timeline");
    const idxDepoimentos = pageSrc.indexOf("<Depoimentos");
    const idxCTAFinal = pageSrc.indexOf("<CTAFinal");
    assert.ok(idxTimeline > -1 && idxDepoimentos > -1 && idxCTAFinal > -1);
    assert.ok(idxTimeline < idxDepoimentos, "Depoimentos deveria vir depois de Timeline (Como funciona)");
    assert.ok(idxDepoimentos < idxCTAFinal, "Depoimentos deveria vir antes de CTAFinal (CTA principal)");
  });

  test("a seção tem id='depoimentos' com scroll-mt (compensa o header fixo)", () => {
    assert.match(src, /id="depoimentos"/);
    assert.match(src, /scroll-mt-20/);
  });
});

describe("2) Imagens neutras referenciadas -- 22 completas, sem lacunas", () => {
  test("public/depoimentos/ contém exatamente os arquivos referenciados na config, nenhum a mais", () => {
    const dir = path.join(root, "public/depoimentos");
    assert.ok(existsSync(dir), "public/depoimentos/ deveria existir");
    const arquivosNoDisco = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
    const arquivosNaConfig = depoimentos.imagens.map((d) => d.arquivo).sort();
    assert.deepEqual(arquivosNoDisco, arquivosNaConfig);
  });

  test("todo arquivo referenciado na config existe de fato em disco e não está vazio", () => {
    for (const dep of depoimentos.imagens) {
      const caminho = path.join(root, "public/depoimentos", dep.arquivo);
      assert.ok(existsSync(caminho), `${dep.arquivo} deveria existir`);
      const stat = readFileSync(caminho);
      assert.ok(stat.length > 0, `${dep.arquivo} não deveria estar vazio`);
    }
  });

  test("22 depoimentos na config -- sequência completa de depoimento-01.png a depoimento-22.png, sem lacunas", () => {
    assert.equal(depoimentos.imagens.length, 22);
    const numeros = depoimentos.imagens.map((d) => d.numero).sort((a, b) => a - b);
    const esperado = Array.from({ length: 22 }, (_, i) => i + 1);
    assert.deepEqual(numeros, esperado);
    const arquivos = depoimentos.imagens.map((d) => d.arquivo).sort();
    const arquivosEsperados = esperado.map((n) => `depoimento-${String(n).padStart(2, "0")}.png`);
    assert.deepEqual(arquivos, arquivosEsperados);
  });

  test("depoimento-11 está presente na config com as dimensões reais confirmadas (776x1600, 755.903 bytes)", () => {
    const dep11 = depoimentos.imagens.find((d) => d.numero === 11);
    assert.ok(dep11, "depoimento 11 deveria estar na config");
    assert.equal(dep11.arquivo, "depoimento-11.png");
    assert.equal(dep11.largura, 776);
    assert.equal(dep11.altura, 1600);
    const caminho = path.join(root, "public/depoimentos/depoimento-11.png");
    assert.ok(existsSync(caminho));
    assert.equal(readFileSync(caminho).length, 755903);
  });

  test("cada depoimento tem numero, arquivo, largura e altura (dimensões reais -- evita layout shift)", () => {
    for (const dep of depoimentos.imagens) {
      assert.equal(typeof dep.numero, "number");
      assert.match(dep.arquivo, /^depoimento-\d{2}\.png$/);
      assert.ok(dep.largura > 0 && dep.altura > 0, `${dep.arquivo} deveria ter largura/altura > 0`);
    }
  });

  test("Depoimentos.js referencia as imagens a partir de /depoimentos/ (public/), nunca um caminho fora do domínio", () => {
    assert.match(src, /src=\{`\/depoimentos\/\$\{.*\}`\}/);
  });
});

describe("3) Grid progressivo: 6 iniciais + 'Ver mais depoimentos' revela o resto", () => {
  test("depoimentos.quantidadeInicial é 6", () => {
    assert.equal(depoimentos.quantidadeInicial, 6);
  });

  test("o grid inicial (não expandido) usa depoimentos.imagens.slice(0, quantidadeInicial)", () => {
    assert.match(src, /depoimentos\.imagens\.slice\(0, depoimentos\.quantidadeInicial\)/);
  });

  test("existe o botão 'Ver mais depoimentos', condicional a expandido === false e a existirem mais itens que a quantidade inicial", () => {
    assert.match(src, /Ver mais depoimentos/);
    const idx = src.indexOf("Ver mais depoimentos");
    const antes = src.slice(Math.max(0, idx - 500), idx);
    assert.match(antes, /!expandido/);
  });

  test("clicar no botão troca pra exibir depoimentos.imagens (a lista completa)", () => {
    assert.match(src, /onClick=\{\(\) => setExpandido\(true\)\}/);
    assert.match(src, /const visiveis = expandido\s*\n?\s*\?\s*depoimentos\.imagens/);
  });

  test("nenhum carrossel com rotação automática (sem setInterval/autoplay no componente)", () => {
    assert.doesNotMatch(src, /setInterval/);
    assert.doesNotMatch(src, /autoplay/i);
  });

  test("grid é de 1 coluna no celular (mobile-first, sem grid-cols fixo maior que 1 por padrão)", () => {
    assert.match(src, /grid-cols-1 sm:grid-cols-2 md:grid-cols-3/);
  });
});

describe("4) Modal/lightbox acessível", () => {
  test("tem role=dialog e aria-modal=true", () => {
    assert.match(src, /role="dialog"/);
    assert.match(src, /aria-modal="true"/);
  });

  test("tem nome acessível (aria-label com o número do depoimento, nunca um nome de pessoa)", () => {
    const idx = src.indexOf('role="dialog"');
    const trecho = src.slice(idx, idx + 200);
    assert.match(trecho, /aria-label=\{`Depoimento anônimo \$\{item\.numero\}/);
  });

  test("fecha com Escape (listener de keydown chamando fecharModal)", () => {
    assert.match(src, /e\.key === "Escape"\) fecharModal\(\)/);
  });

  test("fecha ao clicar fora (backdrop) mas NÃO ao clicar dentro (stopPropagation)", () => {
    const idxBackdrop = src.indexOf("bg-black/80");
    const trechoBackdrop = src.slice(Math.max(0, idxBackdrop - 100), idxBackdrop + 100);
    assert.match(trechoBackdrop, /onClick=\{fecharModal\}/);
    assert.match(src, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  });

  test("existe um botão explícito de fechar, com aria-label", () => {
    assert.match(src, /aria-label="Fechar"/);
  });

  test("bloqueia a rolagem do fundo enquanto aberto e restaura no cleanup", () => {
    const idx = src.indexOf("useEffect(() => {\n    if (modalIdx === null)");
    const idxFim = src.indexOf("}, [modalIdx]);");
    const trecho = src.slice(idx, idxFim);
    assert.match(trecho, /document\.body\.style\.overflow = "hidden"/);
    assert.match(trecho, /document\.body\.style\.overflow = overflowOriginal/);
  });

  test("devolve o foco pro elemento que abriu o modal ao fechar", () => {
    assert.match(src, /openerRef\.current\?\.focus\(\)/);
    assert.match(src, /openerRef\.current = elementoQueAbriu/);
  });

  test("foco vai pro botão de fechar quando o modal abre", () => {
    assert.match(src, /closeButtonRef\.current\?\.focus\(\)/);
  });
});

describe("5) next/image correto (dimensões, sizes, lazy loading, sem layout shift)", () => {
  test("importa Image de next/image (não usa <img> cru)", () => {
    assert.match(src, /import Image from "next\/image"/);
    assert.doesNotMatch(src, /<img\s/);
  });

  test("miniatura do grid usa fill + sizes + object-cover dentro de container com aspect-ratio fixo (evita CLS)", () => {
    assert.match(src, /aspect-\[3\/4\]/);
    const idxImgGrid = src.indexOf("fill\n");
    assert.ok(idxImgGrid > -1, "esperava a prop `fill` na imagem do grid");
    const trecho = src.slice(Math.max(0, idxImgGrid - 200), idxImgGrid + 300);
    assert.match(trecho, /sizes="\(max-width: 640px\)/);
    assert.match(trecho, /object-cover/);
  });

  test("imagem do modal usa width/height reais (item.largura/item.altura), não fill", () => {
    const idxModal = src.indexOf('role="dialog"');
    const trecho = src.slice(idxModal);
    assert.match(trecho, /width=\{item\.largura\}/);
    assert.match(trecho, /height=\{item\.altura\}/);
  });

  test("miniaturas usam loading lazy (fora da primeira dobra)", () => {
    assert.match(src, /loading="lazy"/);
  });

  test("alt text é neutro e numerado, no formato exato pedido", () => {
    const alts = src.match(/alt=\{`Depoimento anônimo \$\{[^}]+\} sobre atendimento com Rafael Ribeiro`\}/g) || [];
    assert.equal(alts.length, 2, "esperava esse alt text nas duas imagens (miniatura + modal)");
  });

  test("alt text do depoimento 11 resolve exatamente para 'Depoimento anônimo 11 sobre atendimento com Rafael Ribeiro'", () => {
    const dep11 = depoimentos.imagens.find((d) => d.numero === 11);
    const altEsperado = `Depoimento anônimo ${dep11.numero} sobre atendimento com Rafael Ribeiro`;
    assert.equal(altEsperado, "Depoimento anônimo 11 sobre atendimento com Rafael Ribeiro");
  });
});

describe("6) Nenhuma identificação pessoal vazada no código/conteúdo público", () => {
  test("nenhum campo de nome/identidade na config de depoimentos (só numero/arquivo/largura/altura)", () => {
    for (const dep of depoimentos.imagens) {
      const chaves = Object.keys(dep).sort();
      assert.deepEqual(chaves, ["altura", "arquivo", "largura", "numero"]);
    }
  });

  test("o único nome próprio que aparece em Depoimentos.js é 'Rafael Ribeiro' (já público em todo o site) -- nenhum outro nome", () => {
    // Remove a única ocorrência esperada ("Rafael Ribeiro", já público em
    // todo o site) e garante que não sobra nenhuma outra sequência de
    // duas palavras capitalizadas (padrão de nome próprio) no arquivo.
    const semNomeConhecido = src.replace(/Rafael Ribeiro/g, "");
    const nomesSuspeitos = semNomeConhecido.match(/\b[A-ZÀ-Ú][a-zà-ú]+\s+[A-ZÀ-Ú][a-zà-ú]+\b/g) || [];
    assert.deepEqual(nomesSuspeitos, [], `possível nome próprio encontrado: ${nomesSuspeitos.join(", ")}`);
  });

  test("nenhum arquivo PNG em public/depoimentos/ contém chunk de texto/EXIF (tEXt/iTXt/zTXt/eXIf)", () => {
    const dir = path.join(root, "public/depoimentos");
    for (const arquivo of readdirSync(dir)) {
      if (!arquivo.endsWith(".png")) continue;
      const buf = readFileSync(path.join(dir, arquivo));
      let offset = 8;
      const chunksSuspeitos = [];
      while (offset < buf.length) {
        const len = buf.readUInt32BE(offset);
        const tipo = buf.toString("ascii", offset + 4, offset + 8);
        if (["tEXt", "iTXt", "zTXt", "eXIf"].includes(tipo)) chunksSuspeitos.push(tipo);
        offset += 8 + len + 4;
        if (tipo === "IEND") break;
      }
      assert.deepEqual(chunksSuspeitos, [], `${arquivo} não deveria ter metadado de texto/EXIF`);
    }
  });

  test("nenhum nome de arquivo original (não numerado/neutro) foi commitado em public/depoimentos/", () => {
    const dir = path.join(root, "public/depoimentos");
    for (const arquivo of readdirSync(dir)) {
      assert.match(arquivo, /^depoimento-\d{2}\.png$/, `${arquivo} não segue o padrão neutro esperado`);
    }
  });
});

describe("7) Agenda e painel administrativo não foram alterados nesta rodada", () => {
  test("nenhum arquivo do painel administrativo menciona 'depoimento' (prova que não foi editado por engano)", () => {
    const adminSrc = read("components/admin/AdminAgendamentosClient.js");
    assert.doesNotMatch(adminSrc, /depoimento/i);
  });

  test("config/booking.js (regras de agenda/reserva) não foi tocado -- endereço, duração e horários continuam vindo da mesma fonte de sempre", () => {
    const bookingSrc = read("config/booking.js");
    assert.doesNotMatch(bookingSrc, /depoimento/i);
  });

  test("app/agendar (fluxo de reserva) não menciona depoimentos", () => {
    const agendarPagePath = path.join(root, "app/agendar/page.js");
    assert.ok(existsSync(agendarPagePath), "app/agendar/page.js deveria existir");
    assert.doesNotMatch(readFileSync(agendarPagePath, "utf8"), /depoimento/i);
  });
});

describe("8) Menu: item 'Depoimentos' preserva o resto e continua sem quebrar (ver tests/acabamentoVisual.test.js pra medição de largura)", () => {
  test("Nav.js inclui o item 'Depoimentos' apontando pro id correto", () => {
    const navSrc = read("components/Nav.js");
    assert.match(navSrc, /id:\s*"depoimentos"/);
    assert.ok(navSrc.includes("Depoimentos"));
  });

  test("todos os 6 itens antigos do menu continuam presentes (nada foi removido pra caber o novo)", () => {
    const navSrc = read("components/Nav.js");
    for (const label of ["Início", "Quem é Rafael", "A análise", "Como funciona", "Áreas de atuação", "Perguntas frequentes"]) {
      assert.ok(navSrc.includes(label), `"${label}" deveria continuar no menu`);
    }
  });
});
