// Verifica que o endereço do consultório vem de uma única fonte
// (config/location.js#endereco, reexportada por config/content.js) e
// aparece nos lugares certos -- sem duplicar o texto em componentes.
// Também verifica que o presencial está de fato liberado
// (bookingConfig.presencial.endereco não é mais o placeholder --
// confirmação explícita do Rafael, ver config/booking.js), mantendo a
// trava de segurança pra nunca liberar com endereço vazio/placeholder.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { endereco, faqs } from "../config/content.js";
import { bookingConfig, isPresencialDisponivel } from "../config/booking.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

describe("config/content.js#endereco -- fonte única do endereço", () => {
  test("todos os campos esperados estão preenchidos (não é placeholder)", () => {
    for (const campo of ["logradouro", "bairro", "cidade", "uf", "cep", "textoCompleto", "mapsUrl"]) {
      assert.ok(endereco[campo] && endereco[campo].length > 0, `endereco.${campo} não deveria estar vazio`);
    }
  });

  test("textoCompleto bate exatamente com o endereço confirmado", () => {
    assert.equal(
      endereco.textoCompleto,
      "Av. Dr. Sebastião Mendes da Silva, 287 — Anhangabaú, Jundiaí/SP — CEP 13208-090"
    );
  });

  test("mapsUrl é uma busca segura do Google Maps (https, sem API key exposta)", () => {
    assert.match(endereco.mapsUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
    assert.doesNotMatch(endereco.mapsUrl, /key=/i, "não deveria embutir nenhuma chave de API na URL");
  });
});

describe("components/Footer.js -- exibe o endereço central, com link seguro pro Maps", () => {
  const src = read("components/Footer.js");

  test("importa `endereco` de config/content.js (não hardcoda o texto)", () => {
    assert.match(src, /import\s*\{[^}]*\bendereco\b[^}]*\}\s*from\s*["']@\/config\/content["']/);
  });

  test("renderiza endereco.textoCompleto e endereco.mapsUrl (nunca uma string de endereço solta)", () => {
    assert.match(src, /\{endereco\.textoCompleto\}/);
    assert.match(src, /href=\{endereco\.mapsUrl\}/);
    assert.doesNotMatch(src, /Av\.\s*Dr\.\s*Sebastião/, "o endereço não deveria estar hardcoded no componente");
  });

  test("o link do Google Maps abre em nova aba com segurança (target=_blank + rel noopener noreferrer)", () => {
    const idx = src.indexOf("endereco.mapsUrl");
    const trecho = src.slice(idx, idx + 200);
    assert.match(trecho, /target=["']_blank["']/);
    assert.match(trecho, /rel=["']noopener noreferrer["']/);
  });

  test('mantém o rótulo "Ver no Google Maps" visível pro usuário', () => {
    assert.match(src, /Ver no Google Maps/);
  });
});

describe("FAQ 'É presencial?' -- responde com o endereço central e confirma que dá pra escolher no agendamento", () => {
  test("a resposta usa endereco.textoCompleto (não repete o texto na mão)", () => {
    const item = faqs.find((f) => f.q === "É presencial?");
    assert.ok(item, "esperava encontrar a pergunta 'É presencial?' em faqs");
    assert.match(item.a, new RegExp(endereco.textoCompleto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  test("a resposta confirma que o paciente escolhe a modalidade durante o agendamento (não manda combinar por fora)", () => {
    const item = faqs.find((f) => f.q === "É presencial?");
    assert.doesNotMatch(item.a, /fale pelo whatsapp/i, "presencial já está disponível no site -- não deveria mais mandar combinar por fora");
    assert.match(item.a, /presencial ou online/i);
  });
});

describe("Presencial liberado com confirmação explícita do Rafael (config/booking.js)", () => {
  test("bookingConfig.presencial.endereco não é mais o placeholder -- vem de config/location.js#endereco", () => {
    assert.doesNotMatch(bookingConfig.presencial.endereco, /^\[PLACEHOLDER\]/);
    assert.equal(bookingConfig.presencial.endereco, endereco.textoCompleto);
  });

  test("isPresencialDisponivel() é true com a config real (liberação de fato, não só exibição do endereço)", () => {
    assert.equal(isPresencialDisponivel(bookingConfig), true);
  });

  test("isPresencialDisponivel() continua bloqueando por segurança se o endereço voltar a ficar vazio/placeholder", () => {
    assert.equal(isPresencialDisponivel({ presencial: { endereco: "" } }), false);
    assert.equal(isPresencialDisponivel({ presencial: { endereco: "[PLACEHOLDER] qualquer coisa" } }), false);
  });
});
