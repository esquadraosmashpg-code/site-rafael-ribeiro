// Garante que existe UMA ÚNICA fonte central pro WhatsApp público do
// Rafael (config/content.js#site.whatsappNumero), que Footer, ChatWidget
// e o fluxo de reserva sempre usam essa mesma fonte (nunca um número
// hardcoded à parte), e que o número antigo (do Kennedy/Smash Mídias,
// usado só como placeholder de teste durante o desenvolvimento) nunca
// mais aparece em código de produção. Mesmo padrão de leitura de
// código-fonte já usado no projeto (sem jsdom/testing-library).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../config/content.js";
import { getWhatsappNumber } from "../lib/booking/paymentConfig.js";
import { buildWhatsappUrl, normalizeWhatsappNumber } from "../lib/booking/whatsappMessage.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

// Últimos 4 dígitos do número antigo (Smash Mídias/Kennedy), só pra
// detectar regressão -- nunca o número completo (não é reintroduzido em
// código rastreado, nem aqui).
const ULTIMOS_4_DIGITOS_NUMERO_ANTIGO = "0931";

const ARQUIVOS_QUE_DEVEM_USAR_A_FONTE_CENTRAL = [
  "components/Footer.js",
  "components/ChatWidget.js",
  "components/agendar/StepSucesso.js",
];

describe("1) config/content.js#site.whatsappNumero -- fonte central única", () => {
  test("é a única string de 13 dígitos começando com 55 dentro de config/content.js", () => {
    const src = read("config/content.js");
    const ocorrencias = src.match(/"55\d{11}"/g) || [];
    assert.equal(ocorrencias.length, 1, `esperava exatamente 1 número no formato 55+DDD+número em content.js, achou ${ocorrencias.length}`);
  });

  test("formato válido: só dígitos, começa com DDI 55, 13 dígitos (DDI+DDD+9 dígitos)", () => {
    assert.match(site.whatsappNumero, /^\d+$/, "deveria ser só dígitos");
    assert.match(site.whatsappNumero, /^55\d{11}$/, "deveria começar com 55 e ter 13 dígitos no total");
  });

  test("não termina nos últimos 4 dígitos do número antigo (regressão do bug)", () => {
    assert.notEqual(site.whatsappNumero.slice(-4), ULTIMOS_4_DIGITOS_NUMERO_ANTIGO);
  });
});

describe("2) Footer, ChatWidget e StepSucesso usam buildWhatsappUrl(site.whatsappNumero, ...) -- nunca um número próprio", () => {
  for (const arquivo of ARQUIVOS_QUE_DEVEM_USAR_A_FONTE_CENTRAL) {
    test(`${arquivo} importa buildWhatsappUrl de lib/booking/whatsappMessage`, () => {
      const src = read(arquivo);
      assert.match(src, /import\s*\{[^}]*\bbuildWhatsappUrl\b[^}]*\}\s*from\s*["']@\/lib\/booking\/whatsappMessage["']/);
    });

    test(`${arquivo} chama buildWhatsappUrl(site.whatsappNumero, ...) -- nunca monta "https://wa.me/" na mão`, () => {
      const src = read(arquivo);
      const chamadas = (src.match(/buildWhatsappUrl\(site\.whatsappNumero/g) || []).length;
      assert.ok(chamadas >= 1, `${arquivo} deveria chamar buildWhatsappUrl(site.whatsappNumero, ...) pelo menos uma vez`);
      assert.doesNotMatch(src, /https:\/\/wa\.me\/\$\{/, `${arquivo} não deveria montar o link wa.me manualmente com template string`);
    });

    test(`${arquivo} não contém nenhum literal de número de telefone de 13 dígitos hardcoded`, () => {
      const src = read(arquivo);
      assert.doesNotMatch(src, /["']?55\d{11}["']?/, `${arquivo} não deveria ter nenhum número hardcoded -- só a referência a site.whatsappNumero`);
    });
  }
});

describe("3) Fluxo de reserva (lib/booking/paymentConfig.js) usa a MESMA fonte central", () => {
  test("getWhatsappNumber() devolve exatamente site.whatsappNumero", () => {
    assert.equal(getWhatsappNumber(), site.whatsappNumero);
  });

  test("lib/booking/paymentConfig.js importa `site` de config/content.js (não lê mais process.env.BOOKING_WHATSAPP_NUMBER)", () => {
    const src = read("lib/booking/paymentConfig.js");
    assert.match(src, /import\s*\{\s*site\s*\}\s*from\s*["']\.\.\/\.\.\/config\/content\.js["']/);
    // Comentários podem CITAR o nome da variável antiga (documentando a
    // mudança) -- o que não pode existir é uma leitura de verdade,
    // process.env.BOOKING_WHATSAPP_NUMBER.
    assert.doesNotMatch(src, /process\.env\.BOOKING_WHATSAPP_NUMBER/, "não deveria mais LER essa variável de ambiente -- a fonte agora é central");
  });

  test("app/api/agendar/reservar/route.js continua usando getWhatsappNumber() (indiretamente, a mesma fonte)", () => {
    const src = read("app/api/agendar/reservar/route.js");
    assert.match(src, /getWhatsappNumber\(\)/);
  });
});

describe("4) Footer, ChatWidget e reserva apontam pro MESMO Rafael (mesma fonte, mesmo valor)", () => {
  test("Footer, ChatWidget/StepSucesso (via site.whatsappNumero) e a reserva (via getWhatsappNumber()) resolvem pro mesmo número", () => {
    assert.equal(getWhatsappNumber(), site.whatsappNumero);
    for (const arquivo of ARQUIVOS_QUE_DEVEM_USAR_A_FONTE_CENTRAL) {
      const src = read(arquivo);
      // Todos importam `site` de "@/config/content" -- garantindo que
      // usam a mesma instância do objeto de configuração, não uma cópia.
      assert.match(src, /import\s*\{[^}]*\bsite\b[^}]*\}\s*from\s*["']@\/config\/content["']/, `${arquivo} deveria importar site de @/config/content`);
    }
  });
});

describe("5) buildWhatsappUrl/normalizeWhatsappNumber -- normalização e formato do link", () => {
  test("normalizeWhatsappNumber remove tudo que não é dígito", () => {
    assert.equal(normalizeWhatsappNumber("+55 (11) 99999-8888"), "5511999998888");
  });

  test("buildWhatsappUrl gera exatamente https://wa.me/55... (sem mensagem)", () => {
    assert.equal(buildWhatsappUrl("5511999998888"), "https://wa.me/5511999998888");
  });

  test("buildWhatsappUrl gera https://wa.me/55...?text=... com mensagem codificada uma única vez", () => {
    const url = buildWhatsappUrl("5511999998888", "Olá!");
    assert.equal(url, "https://wa.me/5511999998888?text=Ol%C3%A1!");
  });

  test("buildWhatsappUrl(site.whatsappNumero) usado de verdade gera um link começando com https://wa.me/55", () => {
    const url = buildWhatsappUrl(site.whatsappNumero);
    assert.match(url, /^https:\/\/wa\.me\/55\d{11}$/);
  });
});

describe("6) Número antigo (Smash Mídias/Kennedy) não existe mais em código de produção", () => {
  const dirsIgnorados = new Set(["node_modules", ".git", ".next", "coverage", "tests"]);

  function varrerDiretorio(dirRelativo, encontrados) {
    const dirAbsoluto = path.join(root, dirRelativo);
    let entradas;
    try {
      entradas = readdirSync(dirAbsoluto, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      if (dirsIgnorados.has(entrada.name)) continue;
      const relPath = path.join(dirRelativo, entrada.name);
      if (entrada.isDirectory()) {
        varrerDiretorio(relPath, encontrados);
      } else if (entrada.isFile() && /\.(js|jsx|ts|tsx|md)$/.test(entrada.name)) {
        const conteudo = readFileSync(path.join(root, relPath), "utf8");
        // Procura qualquer número de 13 dígitos (55+DDD+9) que termine
        // nos 4 últimos dígitos do número antigo -- sem precisar
        // reintroduzir o número completo neste arquivo de teste.
        const regex = new RegExp(`55\\d{7}${ULTIMOS_4_DIGITOS_NUMERO_ANTIGO}`);
        if (regex.test(conteudo)) encontrados.push(relPath.replace(/\\/g, "/"));
      }
    }
    return encontrados;
  }

  test("nenhum arquivo de produção (fora de tests/) contém um número terminado nos últimos 4 dígitos do número antigo", () => {
    const encontrados = varrerDiretorio(".", []);
    assert.deepEqual(encontrados, [], `número antigo (ou um número parecido) ainda presente em: ${encontrados.join(", ")}`);
  });
});
