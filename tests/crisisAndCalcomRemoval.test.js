import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

function listSourceFiles(dir, exts = [".js", ".jsx"]) {
  const skip = new Set(["node_modules", ".next", ".git", "tests"]);
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(full, exts));
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

describe("Cal.com removido do código-fonte", () => {
  test("nenhum arquivo de app/, components/, config/ ou lib/ referencia cal.com", () => {
    const dirs = ["app", "components", "config", "lib"].map((d) => path.join(root, d));
    const offenders = [];
    for (const dir of dirs) {
      for (const file of listSourceFiles(dir)) {
        const content = readFileSync(file, "utf8");
        if (/cal\.com/i.test(content)) offenders.push(file);
      }
    }
    assert.deepEqual(offenders, [], `Ainda referencia cal.com: ${offenders.join(", ")}`);
  });

  test("botão 'Agendar agora' da Secretária Virtual aponta para /agendar (site.agendaPath)", () => {
    const content = readFileSync(path.join(root, "components", "ChatWidget.js"), "utf8");
    assert.match(content, /href=\{site\.agendaPath\}/);
  });
});

describe("Protocolo de crise preservado (ChatWidget)", () => {
  const content = readFileSync(path.join(root, "components", "ChatWidget.js"), "utf8");

  test("mostra CVV (188) e SAMU (192) como tel: clicáveis", () => {
    assert.match(content, /tel:188/);
    assert.match(content, /tel:192/);
  });

  test("não apresenta 'Agendar' como ação dentro do bloco de crise (riskFlag)", () => {
    const riskBlockStart = content.indexOf("finished && riskFlag");
    const normalBlockStart = content.indexOf("finished && !riskFlag");
    assert.ok(riskBlockStart > -1, "bloco de crise não encontrado");
    assert.ok(normalBlockStart > riskBlockStart, "bloco normal deveria vir depois do bloco de crise");
    const riskBlock = content.slice(riskBlockStart, normalBlockStart);
    assert.ok(!/Agendar agora/i.test(riskBlock), "bloco de crise não deveria oferecer 'Agendar agora'");
  });

  test("WhatsApp no bloco de crise não inclui texto pré-preenchido com respostas do usuário", () => {
    const riskBlockStart = content.indexOf("finished && riskFlag");
    const normalBlockStart = content.indexOf("finished && !riskFlag");
    const riskBlock = content.slice(riskBlockStart, normalBlockStart);
    // no bloco de crise, buildWhatsappUrl deve ser chamado só com o número
    // (sem segundo argumento de mensagem) -- nunca monta "?text=" com base
    // em answers.*
    const waLinkMatch = riskBlock.match(/buildWhatsappUrl\(([^)]*)\)/);
    assert.ok(waLinkMatch, "chamada a buildWhatsappUrl não encontrada no bloco de crise");
    assert.ok(!waLinkMatch[1].includes(","), "buildWhatsappUrl no bloco de crise não deveria receber um segundo argumento (mensagem)");
    assert.ok(!waLinkMatch[1].includes("answers."), "WhatsApp de crise não deveria enviar respostas do usuário automaticamente");
  });

  test("orienta a não ficar sozinho / procurar alguém de confiança", () => {
    assert.match(content, /não precisa passar por isso sozinh/i);
  });
});
