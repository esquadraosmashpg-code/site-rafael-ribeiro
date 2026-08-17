// Cobre os 3 ajustes finais de acabamento visual: título do bloco de
// endereço no rodapé, contraste do rodapé, e a quebra de linha do menu
// desktop. Mesmo padrão de leitura de código-fonte já usado no projeto
// (sem jsdom -- ver tests/navegacaoConversao.test.js). O endereço em si
// (fonte central, mapsUrl, link seguro) já é coberto por
// tests/endereco.test.js -- aqui só o que é específico desta rodada.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../config/content.js";

// Últimos 4 dígitos do número antigo (Smash Mídias/Kennedy) -- mesmo
// valor usado em tests/whatsappSource.test.js, só pra checagem local
// rápida do rodapé (a varredura completa do projeto já é feita lá).
const ULTIMOS_4_DIGITOS_NUMERO_ANTIGO = "0931";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

describe("1) Título do bloco de endereço no rodapé", () => {
  test("site.localizacaoTexto é 'Localização do consultório' (não 'e horários' -- não há horário exibido)", () => {
    assert.equal(site.localizacaoTexto, "Localização do consultório");
  });

  test("Footer.js usa site.localizacaoTexto (não hardcoda o texto)", () => {
    const src = read("components/Footer.js");
    assert.match(src, /\{site\.localizacaoTexto\}/);
  });

  test("a expressão antiga 'Localização e horários' não aparece em nenhum lugar do config/componente", () => {
    assert.doesNotMatch(read("config/content.js"), /Localização e horários/);
    assert.doesNotMatch(read("components/Footer.js"), /Localização e horários/);
  });

  test("nenhum horário de funcionamento é inventado perto do bloco de endereço", () => {
    const src = read("components/Footer.js");
    assert.doesNotMatch(src, /\d{1,2}h(\s*(às|-)\s*\d{1,2}h)?/i, "não deveria haver texto de horário tipo '9h às 18h'");
    assert.doesNotMatch(src, /segunda a sexta|seg\s*a\s*sex|horário de atendimento/i);
  });
});

describe("2) Contraste do rodapé", () => {
  const src = read("components/Footer.js");

  test("não usa mais o esquema antigo de uma cor única + opacity-85 em tudo", () => {
    assert.doesNotMatch(src, /opacity-85/);
    assert.doesNotMatch(src, /text-\[#aab0c0\]/);
  });

  test("títulos (h5) permanecem brancos e com mais destaque que texto/links", () => {
    const matches = src.match(/<h5[^>]*className="([^"]*)"/g) || [];
    assert.ok(matches.length >= 2, "esperava pelo menos 2 títulos h5 (nome do site + Institucional)");
    for (const m of matches) {
      assert.match(m, /text-white/);
      assert.match(m, /font-semibold/);
    }
  });

  test("texto de corpo (endereço) e links usam cores sólidas distintas entre si (hierarquia visual)", () => {
    assert.match(src, /TEXTO_CORPO\s*=\s*["']text-\[#c9cfdc\]["']/);
    assert.match(src, /LINK_RODAPE\s*=[\s\S]*?text-\[#9aa3b8\]/);
    assert.notEqual("#c9cfdc", "#9aa3b8"); // cores diferentes -- hierarquia, não tudo igual
  });

  test("todos os links do rodapé têm hover e focus-visible claros (dourado)", () => {
    const linkDefMatch = src.match(/LINK_RODAPE\s*=\s*"([^"]*)"/);
    assert.ok(linkDefMatch, "esperava encontrar a constante LINK_RODAPE");
    assert.match(linkDefMatch[1], /hover:text-gold/);
    assert.match(linkDefMatch[1], /focus-visible:text-gold/);
  });

  test("a constante de link é reaproveitada em todos os links do rodapé (WhatsApp, Instagram, Maps, institucional)", () => {
    const usos = (src.match(/className=\{LINK_RODAPE\}/g) || []).length;
    // WhatsApp, Instagram, Maps + 4 links institucionais = 7
    assert.equal(usos, 7, `esperava 7 usos de LINK_RODAPE, achou ${usos}`);
  });

  test("rodapé continua azul-marinho com destaque dourado (identidade preservada)", () => {
    assert.match(src, /bg-navy-dark/);
    assert.match(src, /hover:text-gold/);
  });

  test("crédito 'Site por Smash Mídias' continua presente", () => {
    assert.match(src, /Site por Smash Mídias/);
  });

  test("nenhum destino de link foi alterado (WhatsApp, Instagram, institucional)", () => {
    assert.match(src, /buildWhatsappUrl\(site\.whatsappNumero\)/);
    assert.match(src, /https:\/\/instagram\.com\/\$\{site\.instagram\.replace\("@", ""\)\}/);
    assert.match(src, /href="\/privacidade"/);
    assert.match(src, /href="\/lgpd"/);
    assert.match(src, /href="\/cookies"/);
    assert.match(src, /href="\/termos"/);
  });

  test("número antigo de WhatsApp não reaparece no rodapé", () => {
    const regex = new RegExp(`55\\d{7}${ULTIMOS_4_DIGITOS_NUMERO_ANTIGO}`);
    assert.doesNotMatch(src, regex);
    assert.match(src, /site\.whatsappNumero/, "deveria continuar usando a fonte central, nunca um número solto");
  });
});

describe("3) Menu desktop não quebra linha (1280/1366/1440/1920px)", () => {
  const src = read("components/Nav.js");

  test("preserva todos os 6 itens do menu e seus destinos de âncora", () => {
    const itensEsperados = [
      ["inicio", "Início"],
      ["quem-e-rafael", "Quem é Rafael"],
      ["a-analise", "A análise"],
      ["como-funciona", "Como funciona"],
      ["areas-atuacao", "Áreas de atuação"],
      ["faq", "Perguntas frequentes"],
    ];
    for (const [id, label] of itensEsperados) {
      assert.match(src, new RegExp(`id:\\s*"${id}"`), `id "${id}" ausente`);
      assert.ok(src.includes(label), `label "${label}" ausente`);
    }
  });

  test("container da barra de navegação é mais largo que o das seções de conteúdo (causa raiz da quebra)", () => {
    // max-w-5xl (1024px) era estreito demais pros 6 itens + logo + CTA
    // -- nunca cabia numa linha só, em NENHUMA largura de tela. max-w-7xl
    // dá margem real de sobra (testado via browser em 1280/1366/1440/1920,
    // ver relatório da rodada).
    assert.match(src, /max-w-7xl mx-auto flex items-center justify-between/);
  });

  test("cada item do menu tem whitespace-nowrap (nunca quebra o label em 2 linhas, mesmo sob pressão)", () => {
    const idx = src.indexOf("NAV_ITEMS.map((item) => (");
    const idxFim = src.indexOf("</div>", idx);
    const trecho = src.slice(idx, idxFim);
    assert.match(trecho, /whitespace-nowrap/);
    assert.match(trecho, /shrink-0/);
  });

  test("logotipo, itens do menu e CTA sobem juntos pro breakpoint xl (1280px) -- não lg (1024px)", () => {
    // Medição real no navegador (ver relatório da rodada de correção):
    // em 1024px a barra completa (logo + 6 itens + CTA, com shrink-0)
    // precisa de ~1075px, mas só tem ~1009px disponíveis -- vira
    // rolagem horizontal em vez de quebra de linha, o que é pior. xl
    // (1280px) é o primeiro breakpoint que mediu sem estouro em nenhuma
    // largura entre 1024 e 1279px. Garante também que os 4 elementos
    // (logo, wrapper de itens, CTA, hambúrguer + menu mobile) mudam de
    // estado exatamente no mesmo breakpoint -- nunca um muda e o outro
    // não, o que deixaria uma faixa de largura sem nav nenhuma.
    assert.doesNotMatch(src, /\bmd:flex\b|\bmd:hidden\b|\bmd:inline-block\b|\bmd:text-base\b/);
    assert.doesNotMatch(src, /\blg:flex\b|\blg:hidden\b|\blg:inline-block\b|\blg:text-base\b/);
    assert.match(src, /hidden xl:flex items-center/);
    assert.match(src, /hidden xl:inline-block bg-gold/);
    const hamburgerMatches = src.match(/xl:hidden/g) || [];
    assert.ok(hamburgerMatches.length >= 2, "esperava xl:hidden no botão hambúrguer e no menu mobile");
  });

  test("CTA e logotipo continuam com destinos/textos inalterados", () => {
    assert.match(src, /\{ctaAgendar\.texto\}/);
    assert.match(src, /href=\{ctaAgendar\.href\}/);
    assert.match(src, /\{site\.nome\}/);
  });
});

describe("4) Painel administrativo não foi tocado nesta rodada", () => {
  test("AdminAgendamentosClient.js não menciona nenhum dos textos novos desta rodada (prova que não foi editado por engano)", () => {
    const src = read("components/admin/AdminAgendamentosClient.js");
    assert.doesNotMatch(src, /Localização do consultório/);
    assert.doesNotMatch(src, /max-w-7xl/);
  });
});
