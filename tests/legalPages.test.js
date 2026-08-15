// Garante que as páginas legais públicas (cookies, privacidade, LGPD,
// termos) nunca voltem a expor avisos internos de desenvolvimento, e que
// Google Analytics/Meta Pixel só sejam mencionados na Política de
// Cookies se houver implementação real comprovada no código -- nunca por
// suposição. Mesmo padrão de leitura de código-fonte já usado no projeto
// (sem jsdom/testing-library).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const PAGINAS_LEGAIS = ["app/cookies/page.js", "app/privacidade/page.js", "app/lgpd/page.js", "app/termos/page.js"];
const COMPONENTE_COMPARTILHADO = "components/LegalPage.js";

const PADROES_INTERNOS = [
  /\bdraft\b/i,
  /gerado como parte do desenvolvimento/i,
  /revis[ãa]o por advogado/i,
  /texto inicial/i,
  /revis[ãa]o pendente/i,
  /\[PLACEHOLDER\]/,
];

describe("Páginas legais públicas -- nunca expõem avisos internos de desenvolvimento", () => {
  for (const pagina of [...PAGINAS_LEGAIS, COMPONENTE_COMPARTILHADO]) {
    test(`${pagina} não contém nenhum padrão de aviso interno/draft/placeholder`, () => {
      const src = read(pagina);
      for (const padrao of PADROES_INTERNOS) {
        assert.doesNotMatch(src, padrao, `${pagina} contém um padrão de aviso interno: ${padrao}`);
      }
    });
  }
});

// Varredura no restante do código (fora das 4 páginas legais e deste
// próprio arquivo de teste) por evidência de implementação REAL de
// Analytics/Pixel -- scripts de rastreamento, chamadas gtag/fbq, tags do
// Google Tag Manager. Se nada disso existir, a Política de Cookies NUNCA
// pode afirmar que essas ferramentas são usadas.
function existeImplementacaoRealDeAnalyticsOuPixel() {
  const padroesDeImplementacao = [
    /gtag\s*\(/,
    /googletagmanager\.com/,
    /GA_MEASUREMENT_ID/,
    /NEXT_PUBLIC_GA_/,
    /fbq\s*\(/,
    /connect\.facebook\.net/,
    /GTM-[A-Z0-9]+/,
  ];

  const dirsIgnorados = new Set(["node_modules", ".git", ".next", "coverage", "tests"]);
  function varrerDiretorio(dirRelativo) {
    const dirAbsoluto = path.join(root, dirRelativo);
    let entradas;
    try {
      entradas = readdirSync(dirAbsoluto, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entrada of entradas) {
      if (dirsIgnorados.has(entrada.name)) continue;
      const relPath = path.join(dirRelativo, entrada.name);
      if (entrada.isDirectory()) {
        if (varrerDiretorio(relPath)) return true;
      } else if (entrada.isFile() && /\.(js|jsx|ts|tsx)$/.test(entrada.name)) {
        // Nunca varre as próprias páginas legais (elas podem CITAR os
        // nomes das ferramentas em texto -- isso não é "implementação").
        if (PAGINAS_LEGAIS.includes(relPath.replace(/\\/g, "/"))) continue;
        const conteudo = readFileSync(path.join(root, relPath), "utf8");
        if (padroesDeImplementacao.some((p) => p.test(conteudo))) return true;
      }
    }
    return false;
  }
  return varrerDiretorio(".");
}

describe("Política de Cookies -- Analytics/Meta Pixel só mencionados se realmente implementados", () => {
  const implementado = existeImplementacaoRealDeAnalyticsOuPixel();
  const srcCookies = read("app/cookies/page.js");

  test("checagem de sanidade: a varredura de fato NÃO encontra nenhuma implementação real hoje", () => {
    // Este teste documenta o estado atual (nenhum Analytics/Pixel
    // implementado). Se algum dia isso mudar (alguém adicionar a
    // implementação de verdade), este teste passa a falhar -- é o sinal
    // pra também atualizar o texto da Política de Cookies, não simplesmente
    // apagar este teste.
    assert.equal(implementado, false, "se este teste falhar, uma implementação real de Analytics/Pixel foi adicionada -- revise app/cookies/page.js pra refletir isso");
  });

  test("sem implementação real, a página de cookies nunca afirma POSITIVAMENTE usar Google Analytics ou Meta Pixel", () => {
    if (implementado) return; // guarda -- se um dia houver implementação real, essa alegação passa a ser válida
    // Só reprova se "Google Analytics"/"Meta Pixel" aparecer FORA de uma
    // frase de negação ("não usamos...") -- ou seja, corta o texto em
    // frases e cada frase que cita a ferramenta precisa conter uma
    // negação.
    const frases = srcCookies.split(/(?<=[.!?])\s+/);
    for (const frase of frases) {
      if (/google analytics|meta pixel/i.test(frase)) {
        assert.match(frase, /não|nenhuma|sem/i, `menção a Analytics/Pixel fora de uma negação: "${frase.trim()}"`);
      }
    }
  });

  test("a página de cookies afirma explicitamente que NÃO usa Analytics/Pixel/publicidade no momento", () => {
    assert.match(srcCookies, /não usamos google analytics/i);
    assert.match(srcCookies, /meta pixel/i);
  });

  test("a página de cookies descreve o cookie de sessão do painel administrativo sem revelar nome técnico/segredo", () => {
    assert.match(srcCookies, /sess[ãa]o do painel administrativo/i);
    // Nunca deveria vazar o nome real da cookie (ver lib/admin/session.js#ADMIN_COOKIE_NAME).
    assert.doesNotMatch(srcCookies, /booking_admin_session/);
    assert.doesNotMatch(srcCookies, /g_oauth_state/);
  });
});
