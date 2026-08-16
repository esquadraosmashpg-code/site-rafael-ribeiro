// Cobre as funcionalidades do painel administrativo: atualização automática
// (polling gated por visibilidade/foco/concorrência), alerta sonoro,
// notificação visual/do navegador sem PII, detecção de reserva nova com
// baseline monotônica, e atalho de celular ("Adicionar à Tela de Início").
// Mesmo padrão de leitura de código-fonte já usado no projeto (sem
// jsdom/testing-library -- ver tests/navegacaoConversao.test.js). Os
// ícones (icon.js/apple-icon.js) usam JSX + next/og, que só resolvem
// dentro do bundler do Next -- não dá pra `import()` esses arquivos em
// `node --test` puro, então a cobertura aqui é estrutural (código-fonte);
// a verificação end-to-end das dimensões/Content-Type reais foi feita
// manualmente subindo `next start` e buscando os PNGs de verdade (ver
// relatório da auditoria).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unlockAlertSound, playAlertBeep, closeAlertSound } from "../lib/admin/alertSound.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const src = read("components/admin/AdminAgendamentosClient.js");

describe("1) Atualização automática do painel (polling)", () => {
  test("o intervalo de polling é de exatamente 30 segundos", () => {
    assert.match(src, /POLL_INTERVAL_MS\s*=\s*30_000/);
  });

  test("o polling só roda enquanto autenticado (authState === 'authed')", () => {
    const idx = src.indexOf("useEffect(() => {\n    if (authState !== ");
    assert.ok(idx > -1, "esperava um useEffect de polling que checa authState logo no início");
    assert.match(src.slice(idx, idx + 100), /authState\s*!==\s*["']authed["']/);
  });

  test("pausa o setInterval quando a aba fica oculta e retoma quando fica visível", () => {
    const idxEfeito = src.indexOf("function aoMudarVisibilidadePolling");
    const trecho = src.slice(idxEfeito, idxEfeito + 400);
    assert.match(trecho, /document\.visibilityState\s*===\s*["']visible["']/);
    assert.match(trecho, /pararIntervalo\(\)/);
    assert.match(trecho, /iniciarIntervalo\(\)/);
  });

  test("busca imediatamente ao voltar a ficar visível e ao ganhar foco (sem esperar os 30s)", () => {
    const idxEfeito = src.indexOf("function aoMudarVisibilidadePolling");
    const idxFocar = src.indexOf("function aoFocarPolling");
    const trechoVisivel = src.slice(idxEfeito, idxEfeito + 400);
    const trechoFoco = src.slice(idxFocar, idxFocar + 200);
    assert.match(trechoVisivel, /carregarLista\(\{\s*silencioso:\s*true\s*\}\)/);
    assert.match(trechoFoco, /carregarLista\(\{\s*silencioso:\s*true\s*\}\)/);
  });

  test("o efeito de polling registra e limpa visibilitychange/focus no cleanup", () => {
    const idx = src.indexOf("if (document.visibilityState === \"visible\") iniciarIntervalo();");
    const trecho = src.slice(idx, idx + 500);
    assert.match(trecho, /document\.addEventListener\(["']visibilitychange["'],\s*aoMudarVisibilidadePolling\)/);
    assert.match(trecho, /window\.addEventListener\(["']focus["'],\s*aoFocarPolling\)/);
    assert.match(trecho, /return\s*\(\)\s*=>\s*\{/);
    assert.match(trecho, /pararIntervalo\(\)/);
    assert.match(trecho, /document\.removeEventListener\(["']visibilitychange["'],\s*aoMudarVisibilidadePolling\)/);
    assert.match(trecho, /window\.removeEventListener\(["']focus["'],\s*aoFocarPolling\)/);
  });

  test("carregarLista tem uma trava de concorrência (nunca duas buscas ao mesmo tempo)", () => {
    const idx = src.indexOf("const carregarLista = useCallback");
    const trecho = src.slice(idx, idx + 400);
    assert.match(trecho, /if\s*\(buscaEmAndamentoRef\.current\)\s*return/);
    assert.match(trecho, /buscaEmAndamentoRef\.current\s*=\s*true/);
    const idxFinally = src.indexOf("buscaEmAndamentoRef.current = false", idx);
    assert.ok(idxFinally > -1, "esperava resetar a trava no finally");
  });

  test("busca silenciosa (poll automático) nunca ativa o listLoading -- não pode piscar a tabela", () => {
    const idx = src.indexOf("const carregarLista = useCallback");
    const idxFim = src.indexOf("}, [alertasAtivos]);");
    const trecho = src.slice(idx, idxFim);
    assert.match(trecho, /if\s*\(!silencioso\)\s*\{\s*setListLoading\(true\)/);
    assert.match(trecho, /if\s*\(!silencioso\)\s*setListLoading\(false\)/);
  });

  test("o botão manual 'Atualizar' continua existindo e chama carregarLista sem silencioso", () => {
    assert.match(src, /onClick=\{\(\)\s*=>\s*carregarLista\(\)\}/);
    assert.match(src, />\s*Atualizar\s*</);
  });
});

describe("2) Privacidade dos alertas (nunca PII no banner/título/Notification)", () => {
  test("mensagemAlerta só recebe uma quantidade (número), nunca um objeto de reserva", () => {
    const idx = src.indexOf("function mensagemAlerta(quantidade)");
    assert.ok(idx > -1, "mensagemAlerta deveria receber só `quantidade`");
    const trecho = src.slice(idx, idx + 250);
    assert.match(trecho, /Nova reserva aguardando pagamento/);
    assert.match(trecho, /novas reservas aguardando pagamento/);
    // nunca deveria referenciar nome/telefone/e-mail/data/horário de uma reserva
    assert.doesNotMatch(trecho, /\.nome|\.whatsapp|\.email|\.data|\.horario/);
  });

  test("dispararAlertaNovaReserva só recebe uma quantidade -- nunca a lista de reservas em si", () => {
    const idx = src.indexOf("function dispararAlertaNovaReserva(quantidade)");
    assert.ok(idx > -1, "dispararAlertaNovaReserva deveria ter assinatura (quantidade)");
  });

  test("a chamada que detecta 'chegou agora' passa só o tamanho da lista, nunca a lista", () => {
    const idx = src.indexOf("dispararAlertaNovaReserva(novasChegadas.length)");
    assert.ok(idx > -1, "esperava dispararAlertaNovaReserva(novasChegadas.length) -- só a contagem");
  });

  test("new Notification() usa o texto genérico (mensagemAlerta), nunca dados da reserva", () => {
    const idx = src.indexOf("new Notification(");
    const trecho = src.slice(Math.max(0, idx - 300), idx + 150);
    assert.match(trecho, /Notification\.permission === ["']granted["']/);
    assert.match(trecho, /body:\s*texto/);
    assert.doesNotMatch(trecho, /\.nome|\.whatsapp|\.email/);
  });

  test("o título da aba (TITLE_ALERTA) é um texto fixo genérico, não interpolado com dados da reserva", () => {
    assert.match(src, /TITLE_ALERTA\s*=\s*["'][^"'`]*["']/);
    const idx = src.indexOf("const TITLE_ALERTA");
    const linha = src.slice(idx, src.indexOf("\n", idx));
    assert.doesNotMatch(linha, /\$\{/, "não deveria ser um template string interpolado");
  });

  test("o banner exibido em tela usa bannerNovaReserva vindo de mensagemAlerta -- nunca PII", () => {
    assert.match(src, /setBannerNovaReserva\(texto\)/);
    const idxBanner = src.indexOf("bannerNovaReserva && (");
    const trecho = src.slice(idxBanner, idxBanner + 300);
    assert.doesNotMatch(trecho, /\.nome|\.whatsapp|\.email/);
  });

  test("dados pessoais (nome/whatsapp/email) só aparecem dentro da tabela autenticada (<td>), não fora dela", () => {
    const idxTabela = src.indexOf("<table");
    const antesDaTabela = src.slice(0, idxTabela);
    assert.doesNotMatch(antesDaTabela, /\{b\.nome\}|\{b\.whatsapp\}|\{b\.email\}/);
    const dentroDaTabela = src.slice(idxTabela);
    assert.match(dentroDaTabela, /\{b\.nome\}/);
    assert.match(dentroDaTabela, /\{b\.whatsapp\}/);
    assert.match(dentroDaTabela, /\{b\.email\}/);
  });
});

describe("3) Detecção de reserva nova (baseline monotônica)", () => {
  test("idsConhecidosRef começa null -- a primeira carga autenticada só registra a baseline, nunca alerta", () => {
    assert.match(src, /const idsConhecidosRef = useRef\(null\)/);
    const idx = src.indexOf("if (idsConhecidosRef.current !== null)");
    assert.ok(idx > -1);
    const trecho = src.slice(idx, idx + 700);
    assert.match(trecho, /\}\s*else\s*\{\s*\/\/[^\n]*\n\s*idsConhecidosRef\.current = idsAtuais;/);
  });

  test("a baseline é a UNIÃO de todos os ids já vistos (nunca reduz, mesmo id fora de PENDING_PAYMENT continua contando)", () => {
    const idx = src.indexOf("const idsAtuais = new Set(novasBookings.map((b) => b.id))");
    assert.ok(idx > -1, "idsAtuais deveria vir de TODAS as reservas retornadas, não só as PENDING_PAYMENT");
    const idxUniao = src.indexOf("idsConhecidosRef.current = new Set([...idsConhecidosRef.current, ...idsAtuais])");
    assert.ok(idxUniao > -1, "esperava união (nunca substituição) da baseline a cada busca");
  });

  test("só considera 'chegou agora' quem é PENDING_PAYMENT E ainda não estava na baseline", () => {
    assert.match(
      src,
      /status\s*===\s*["']PENDING_PAYMENT["']\s*&&\s*!idsConhecidosRef\.current\.has\(b\.id\)/
    );
  });

  test("reseta idsConhecidosRef no logout (evita re-alertar tudo num novo login)", () => {
    const idxLogout = src.indexOf("async function handleLogout");
    const idxProximaFuncao = src.indexOf("async function handleAction");
    const trechoLogout = src.slice(idxLogout, idxProximaFuncao);
    assert.match(trechoLogout, /idsConhecidosRef\.current\s*=\s*null/);
  });

  test("nunca chama localStorage.setItem/sessionStorage.setItem (só um comentário explica a decisão, não há uso real)", () => {
    assert.doesNotMatch(src, /localStorage\s*\.\s*setItem|sessionStorage\s*\.\s*setItem/);
    assert.doesNotMatch(src, /window\.localStorage|window\.sessionStorage/);
  });
});

describe("4) Notificação e som", () => {
  test("importa unlockAlertSound/playAlertBeep/closeAlertSound de lib/admin/alertSound", () => {
    assert.match(
      src,
      /import\s*\{\s*unlockAlertSound,\s*playAlertBeep,\s*closeAlertSound\s*\}\s*from\s*["']@\/lib\/admin\/alertSound["']/
    );
  });

  test("unlockAlertSound só é chamado dentro de handleAtivarAlertas (gesto de clique), nunca num useEffect", () => {
    const chamadas = (src.match(/unlockAlertSound\(\)/g) || []).length;
    assert.equal(chamadas, 1, "esperava uma única chamada a unlockAlertSound()");
    const idx = src.indexOf("unlockAlertSound()");
    const antes = src.slice(Math.max(0, idx - 300), idx);
    assert.match(antes, /function handleAtivarAlertas/);
  });

  test("Notification.requestPermission() só é chamado dentro de handleAtivarAlertas, nunca automaticamente", () => {
    const chamadas = (src.match(/Notification\.requestPermission\(\)/g) || []).length;
    assert.equal(chamadas, 1, "esperava uma única chamada a Notification.requestPermission()");
    const idx = src.indexOf("Notification.requestPermission()");
    const antes = src.slice(Math.max(0, idx - 400), idx);
    assert.match(antes, /function handleAtivarAlertas/);
    // não pode estar dentro de nenhum useEffect do arquivo
    const useEffects = [...src.matchAll(/useEffect\(\(\) => \{/g)].map((m) => m.index);
    for (const idxEfeito of useEffects) {
      const fimAprox = src.indexOf("}, [", idxEfeito);
      if (fimAprox === -1) continue;
      const corpo = src.slice(idxEfeito, fimAprox);
      assert.doesNotMatch(corpo, /Notification\.requestPermission/);
    }
  });

  test("existe um botão que dispara handleAtivarAlertas via onClick", () => {
    assert.match(src, /onClick=\{handleAtivarAlertas\}/);
  });

  test("banner e som continuam funcionando mesmo com notificação negada/indisponível", () => {
    // o banner (setBannerNovaReserva) e o som (playAlertBeep) não dependem
    // de Notification.permission -- só a chamada a `new Notification` depende.
    const idx = src.indexOf("function dispararAlertaNovaReserva");
    const idxFim = src.indexOf("const carregarLista = useCallback");
    const trecho = src.slice(idx, idxFim);
    const idxBanner = trecho.indexOf("setBannerNovaReserva(texto)");
    const idxBeep = trecho.indexOf("if (alertasAtivos) playAlertBeep()");
    const idxNotif = trecho.indexOf("Notification.permission");
    assert.ok(idxBanner > -1 && idxBeep > -1 && idxNotif > -1);
    assert.ok(idxBanner < idxNotif && idxBeep < idxNotif, "banner e som devem rodar antes/independente da checagem de Notification");
  });

  test("toca só UM conjunto de bipes por rodada com reservas novas (chamada única de playAlertBeep, fora de loop)", () => {
    const idx = src.indexOf("function dispararAlertaNovaReserva");
    const idxFim = src.indexOf("const carregarLista = useCallback");
    const trecho = src.slice(idx, idxFim);
    const chamadas = (trecho.match(/playAlertBeep\(\)/g) || []).length;
    assert.equal(chamadas, 1);
    // dispararAlertaNovaReserva só pode ser chamada uma vez por rodada de busca,
    // fora de qualquer .map/.forEach (não por reserva individual)
    const idxChamada = src.indexOf("dispararAlertaNovaReserva(novasChegadas.length)");
    const antes = src.slice(Math.max(0, idxChamada - 150), idxChamada);
    assert.doesNotMatch(antes, /\.forEach|\.map\(/);
  });

  test("mostra o texto obrigatório sobre o alerta só funcionar com o painel aberto", () => {
    assert.match(src, /Os alertas funcionam enquanto este painel estiver aberto\./);
  });

  test("explica os 3 estados do painel (aberto/minimizado/fechado) sem prometer alerta com o painel fechado", () => {
    // Sem Web Push/push subscription/serviço em segundo plano, a interface
    // nunca pode prometer que o alerta chega com o painel fechado -- nem no
    // Android, nem no iPhone. Este teste garante que o texto cobre os 3
    // estados corretamente e nunca afirma o contrário.
    assert.match(src, /Painel aberto/);
    assert.match(src, /Painel minimizado/);
    assert.match(src, /Painel fechado ou celular desligado\/reiniciado/);
    assert.match(src, /nenhum alerta é recebido/);
    assert.match(src, /atalho na tela inicial só deixa mais rápido abrir o painel/);
    assert.match(src, /não usa notificação push/);
  });

  test("nunca afirma que alerta/notificação funciona com o painel fechado (nem 'painel fechado' associado a 'funciona')", () => {
    // Checagem estrutural negativa: não pode existir nenhuma frase que
    // combine "fechado" com afirmações de que o alerta/notificação
    // continua funcionando.
    assert.doesNotMatch(src, /fechado[^.]*funciona(m)?\b/i);
    assert.doesNotMatch(src, /segundo plano[^.]*(alerta|notifica)/i);
  });

  test("mostra aviso discreto quando a permissão de notificação foi negada, sem bloquear o resto do painel", () => {
    assert.match(src, /notificacaoPermissao === ["']denied["']/);
  });

  test("o efeito de título pisca/para usa handlers NOMEADOS (removíveis) pro visibilitychange, não uma função anônima", () => {
    const idx = src.indexOf("function aoMudarVisibilidadeTitulo");
    assert.ok(idx > -1, "esperava um handler nomeado aoMudarVisibilidadeTitulo");
    assert.match(src, /document\.addEventListener\(["']visibilitychange["'],\s*aoMudarVisibilidadeTitulo\)/);
    assert.match(src, /document\.removeEventListener\(["']visibilitychange["'],\s*aoMudarVisibilidadeTitulo\)/);
  });

  test("cleanup do componente chama closeAlertSound() (nunca deixa AudioContext aberto)", () => {
    const idx = src.indexOf("return () => closeAlertSound()");
    assert.ok(idx > -1, "esperava closeAlertSound() no cleanup de um useEffect de desmontagem");
  });

  test("lib/admin/alertSound.js: chamar as funções fora do navegador nunca lança exceção", () => {
    assert.doesNotThrow(() => unlockAlertSound());
    assert.doesNotThrow(() => playAlertBeep());
    assert.doesNotThrow(() => closeAlertSound());
  });
});

describe("5) Atalho no celular (Adicionar à Tela de Início)", () => {
  test("app/admin/agendamentos/page.js referencia o manifest dedicado do painel", () => {
    const pageSrc = read("app/admin/agendamentos/page.js");
    assert.match(pageSrc, /manifest:\s*["']\/admin-manifest\.webmanifest["']/);
    assert.match(pageSrc, /appleWebApp:\s*\{/);
    assert.match(pageSrc, /capable:\s*true/);
  });

  test("public/admin-manifest.webmanifest é JSON válido com todos os campos exigidos", () => {
    const manifestPath = "public/admin-manifest.webmanifest";
    assert.ok(existsSync(path.join(root, manifestPath)), "manifest deveria existir");
    const manifest = JSON.parse(read(manifestPath));
    assert.equal(typeof manifest.name, "string");
    assert.ok(manifest.name.length > 0);
    assert.equal(typeof manifest.short_name, "string");
    assert.ok(manifest.short_name.length > 0);
    assert.equal(manifest.start_url, "/admin/agendamentos");
    assert.equal(manifest.scope, "/admin/agendamentos");
    assert.equal(manifest.display, "standalone");
    assert.match(manifest.theme_color, /^#[0-9a-fA-F]{6}$/);
    assert.match(manifest.background_color, /^#[0-9a-fA-F]{6}$/);
    assert.ok(Array.isArray(manifest.icons));
    const tem192 = manifest.icons.some((i) => i.sizes === "192x192" && i.type === "image/png");
    const tem512 = manifest.icons.some((i) => i.sizes === "512x512" && i.type === "image/png");
    assert.ok(tem192, "manifest deveria ter um ícone 192x192 image/png");
    assert.ok(tem512, "manifest deveria ter um ícone 512x512 image/png");
  });

  test("o manifest referencia exatamente as rotas geradas por app/admin/agendamentos/icon.js", () => {
    const manifest = JSON.parse(read("public/admin-manifest.webmanifest"));
    const srcs = manifest.icons.map((i) => i.src);
    assert.ok(srcs.includes("/admin/agendamentos/icon/192"));
    assert.ok(srcs.includes("/admin/agendamentos/icon/512"));
  });

  test("icon.js e apple-icon.js existem e usam next/og (sem asset de imagem novo)", () => {
    for (const arquivo of ["app/admin/agendamentos/icon.js", "app/admin/agendamentos/apple-icon.js"]) {
      assert.ok(existsSync(path.join(root, arquivo)), `${arquivo} deveria existir`);
      const iconSrc = read(arquivo);
      assert.match(iconSrc, /from\s*["']next\/og["']/);
    }
  });

  test("icon.js declara generateImageMetadata com os dois ids 192 e 512", () => {
    const iconSrc = read("app/admin/agendamentos/icon.js");
    assert.match(iconSrc, /export function generateImageMetadata/);
    assert.match(iconSrc, /id:\s*["']192["']/);
    assert.match(iconSrc, /id:\s*["']512["']/);
  });

  test("icon.js faz `await id` antes de decidir o tamanho -- id chega como Promise, não como string", () => {
    // Bug real encontrado na auditoria: o Next (16.2.12) invoca o handler de
    // uma rota de imagem com generateImageMetadata passando `id` como
    // PROMISE (`handler({ params, id: idPromise })` -- ver
    // node_modules/next/dist/build/webpack/loaders/next-metadata-route-loader.js).
    // Sem `await id`, a comparação com "512" nunca era verdadeira e as duas
    // rotas (192 e 512) geravam sempre a mesma imagem de 192x192 -- só
    // HTTP 200, tamanho errado. Não dá pra `import()` este arquivo em
    // `node --test` puro (usa JSX e `next/og`, que só resolvem dentro do
    // bundler do Next), então a checagem aqui é estrutural sobre o código
    // fonte; a verificação end-to end dos bytes reais (dimensão + MIME de
    // /admin/agendamentos/icon/192, /512 e /apple-icon) foi feita subindo
    // `next start` e buscando os PNGs de verdade -- ver relatório da
    // auditoria.
    const iconSrc = read("app/admin/agendamentos/icon.js");
    assert.match(iconSrc, /export default async function Icon\(\{\s*id\s*\}\)/);
    assert.match(iconSrc, /const idResolvido = await id/);
    assert.match(iconSrc, /idResolvido === ["']512["']/);
  });

  test("apple-icon.js declara size 180x180 e contentType image/png", () => {
    const appleSrc = read("app/admin/agendamentos/apple-icon.js");
    assert.match(appleSrc, /export const size = \{\s*width:\s*180,\s*height:\s*180\s*\}/);
    assert.match(appleSrc, /export const contentType = ["']image\/png["']/);
  });

  test("mostra instruções manuais Android/Chrome e iPhone/Safari no painel", () => {
    assert.match(src, /Adicionar à tela inicial/);
    assert.match(src, /Instalar\s+app/);
    assert.match(src, /Compartilhar/);
    assert.match(src, /Adicionar à Tela de Início/);
  });

  test("captura beforeinstallprompt e mostra botão 'Instalar no celular' quando disponível", () => {
    const idx = src.indexOf("function aoTerPromptDisponivel");
    const trecho = src.slice(idx, idx + 300);
    assert.match(trecho, /e\.preventDefault\(\)/);
    assert.match(trecho, /setInstalarPromptEvent\(e\)/);
    assert.match(src, /window\.addEventListener\(["']beforeinstallprompt["'],\s*aoTerPromptDisponivel\)/);
    assert.match(src, /window\.removeEventListener\(["']beforeinstallprompt["'],\s*aoTerPromptDisponivel\)/);
    assert.match(src, /instalarPromptEvent \?/);
    assert.match(src, /Instalar no celular/);
  });

  test("nenhum Service Worker / cache de páginas administrativas é registrado", () => {
    assert.doesNotMatch(src, /serviceWorker|navigator\.serviceWorker|caches\.open/);
    const pageSrc = read("app/admin/agendamentos/page.js");
    assert.doesNotMatch(pageSrc, /serviceWorker/);
  });
});
