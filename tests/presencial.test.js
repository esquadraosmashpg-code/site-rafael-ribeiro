// Cobre a liberação completa do atendimento presencial: as duas
// modalidades sempre visíveis, endereço centralizado (sem hardcode nos
// componentes), revisão presencial com endereço, evento presencial sem
// Meet e com `location`, evento online com Meet, disponibilidade
// compartilhada entre as duas modalidades (mesmo horário bloqueia as
// duas), e persistência da modalidade no Supabase/painel administrativo.
//
// Mesmo padrão de leitura de código-fonte já usado no projeto (sem
// jsdom/testing-library -- ver tests/navegacaoConversao.test.js).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bookingConfig, isPresencialDisponivel } from "../config/booking.js";
import { endereco } from "../config/location.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

describe("1) As duas modalidades sempre disponíveis na primeira etapa", () => {
  test("isPresencialDisponivel() é true com a config real -- online e presencial ambos liberados", () => {
    assert.equal(isPresencialDisponivel(bookingConfig), true);
  });

  test("StepModalidade.js sempre renderiza os dois botões (online e presencial), sem esconder nenhum por config", () => {
    const src = read("components/agendar/StepModalidade.js");
    assert.match(src, /Atendimento online/);
    assert.match(src, /Atendimento presencial/);
    // O botão presencial existe sempre no JSX -- só fica desabilitado
    // (nunca escondido) quando presencialDisponivel for false.
    assert.doesNotMatch(src, /presencialDisponivel\s*&&\s*<button/);
  });

  test("StepModalidade.js desabilita o presencial só via disabled/aria-disabled (nunca via renderização condicional do botão)", () => {
    const src = read("components/agendar/StepModalidade.js");
    assert.match(src, /disabled=\{!presencialDisponivel\}/);
    assert.match(src, /aria-disabled=\{!presencialDisponivel\}/);
  });
});

describe("2) Endereço centralizado -- sem hardcode em nenhum componente do fluxo", () => {
  const arquivosDoFluxo = [
    "components/agendar/StepModalidade.js",
    "components/agendar/AgendarFlow.js",
    "components/agendar/StepRevisao.js",
  ];

  test("nenhum componente hardcoda o texto do endereço", () => {
    for (const arquivo of arquivosDoFluxo) {
      const src = read(arquivo);
      assert.doesNotMatch(src, /Av\.\s*Dr\.\s*Sebastião/, `${arquivo} não deveria ter o endereço hardcoded`);
    }
  });

  test("StepModalidade.js e AgendarFlow.js leem bookingConfig.presencial.endereco (fonte central, não uma string própria)", () => {
    for (const arquivo of ["components/agendar/StepModalidade.js", "components/agendar/AgendarFlow.js"]) {
      const src = read(arquivo);
      assert.match(src, /bookingConfig\.presencial\.endereco/, `${arquivo} deveria ler bookingConfig.presencial.endereco`);
    }
  });

  test("config/booking.js#presencial.endereco vem de config/location.js (não duplica o literal)", () => {
    const src = read("config/booking.js");
    assert.match(src, /import\s*\{\s*endereco\s*\}\s*from\s*["']\.\/location\.js["']/);
    assert.match(src, /endereco:\s*endereco\.textoCompleto/);
    assert.doesNotMatch(src, /Av\.\s*Dr\.\s*Sebastião/, "booking.js não deveria ter o endereço hardcoded, só a referência");
  });

  test("bookingConfig.presencial.endereco === endereco.textoCompleto (mesmo valor, mesma fonte)", () => {
    assert.equal(bookingConfig.presencial.endereco, endereco.textoCompleto);
  });
});

describe("3) AgendarFlow.js mostra o endereço claramente antes de avançar (ao escolher presencial)", () => {
  test("a etapa de data exibe bookingConfig.presencial.endereco quando modalidade === presencial", () => {
    const src = read("components/agendar/AgendarFlow.js");
    const idx = src.indexOf('{modalidade === "presencial" && (');
    assert.ok(idx > -1, "esperava um branch condicional pra modalidade presencial na etapa de data");
    const trecho = src.slice(idx, idx + 700);
    assert.match(trecho, /bookingConfig\.presencial\.endereco/);
  });
});

describe("4) Revisão presencial mostra o endereço; revisão online não", () => {
  const src = read("components/agendar/StepRevisao.js");

  test("StepRevisao.js mostra a linha 'Endereço' só quando modalidade === presencial", () => {
    assert.match(src, /resumo\.modalidade === ["']presencial["'][\s\S]{0,80}label="Endereço"/);
  });

  test("StepRevisao.js lê bookingConfig.presencial.endereco (mesma fonte central)", () => {
    assert.match(src, /bookingConfig\.presencial\.endereco/);
  });
});

describe("5) Evento presencial: sem Meet, com location; evento online: com Meet, sem location", () => {
  const src = read("app/api/admin/agendamentos/[id]/confirmar/route.js");
  const idxCreate = src.indexOf("createCalendarEvent({");
  const trecho = src.slice(idxCreate, idxCreate + 400);

  test('withMeet é derivado de mode === "online" (nunca um valor fixo true)', () => {
    assert.match(trecho, /withMeet:\s*confirming\.mode === ["']online["']/);
  });

  test('location só é preenchido quando mode === "presencial", com o endereço central', () => {
    assert.match(
      trecho,
      /location:\s*confirming\.mode === ["']presencial["']\s*\?\s*bookingConfig\.presencial\.endereco\s*:\s*undefined/
    );
  });

  test("lib/google/calendarClient.js só monta conferenceData (Meet) quando withMeet é true -- nunca incondicionalmente", () => {
    const clientSrc = read("lib/google/calendarClient.js");
    const idxWithMeet = clientSrc.indexOf("if (withMeet)");
    assert.ok(idxWithMeet > -1, "esperava um branch condicional por withMeet");
    const antes = clientSrc.slice(0, idxWithMeet);
    // conferenceData não pode ser montado incondicionalmente antes do if.
    assert.doesNotMatch(antes, /conferenceData\s*=/);
  });

  test("lib/google/calendarClient.js escreve location no evento quando presente, independente de withMeet", () => {
    const clientSrc = read("lib/google/calendarClient.js");
    assert.match(clientSrc, /if\s*\(location\)\s*body\.location\s*=\s*location;/);
  });
});

describe("6) SQL (migration 0001): meet_url só é exigido para mode='online' -- presencial nunca fica preso por falta de Meet", () => {
  const sql = read("supabase/migrations/0001_create_bookings.sql");

  test("finalize_confirmation: a condição do WHERE libera presencial sem meet_url", () => {
    assert.match(sql, /mode\s*<>\s*'online'\s*\n\s*or\s*\(p_google_meet_url is not null/);
  });
});

describe("7) Disponibilidade compartilhada -- mesmo horário bloqueia as duas modalidades", () => {
  test("GET /api/agendar/disponibilidade nunca filtra por modalidade (nem lê ?modalidade= nem passa mode pra listActiveStartsAtForDate)", () => {
    const src = read("app/api/agendar/disponibilidade/route.js");
    assert.doesNotMatch(src, /modalidade/i, "a rota de disponibilidade não deveria nem saber da modalidade -- é a mesma pras duas");
    assert.match(src, /listActiveStartsAtForDate\(dataParam\)/);
  });

  test("listActiveStartsAtForDate() filtra só por booking_date, nunca por mode", () => {
    const src = read("lib/booking/bookingRepository.js");
    const idx = src.indexOf("export async function listActiveStartsAtForDate");
    const trecho = src.slice(idx, idx + 300);
    assert.doesNotMatch(trecho, /mode/i, "não deveria filtrar por mode -- reservas de QUALQUER modalidade bloqueiam o mesmo starts_at");
  });

  test("SQL: create_booking checa conflito de horário (starts_at) sem filtrar por mode -- reserva de uma modalidade bloqueia a outra", () => {
    const sql = read("supabase/migrations/0001_create_bookings.sql");
    const idx = sql.indexOf("esse horário está bloqueado");
    const idxFimBloco = sql.indexOf("slot_taken", idx);
    const trecho = sql.slice(idx, idxFimBloco + 20);
    assert.match(trecho, /where starts_at = p_starts_at/);
    assert.doesNotMatch(trecho, /and mode/i, "a checagem de conflito não deveria filtrar por mode -- vale pras duas modalidades igualmente");
  });

  test("SQL: o lock de concorrência (advisory lock) é derivado só de starts_at, não de mode+starts_at", () => {
    const sql = read("supabase/migrations/0001_create_bookings.sql");
    assert.match(sql, /v_lock_key\s*:=\s*floor\(extract\(epoch from p_starts_at\)\)::bigint/);
  });
});

describe("8) Persistência da modalidade no Supabase e no painel administrativo", () => {
  test("POST /api/agendar/reservar envia value.modalidade como mode pro createBooking (nunca hardcoded 'online')", () => {
    const src = read("app/api/agendar/reservar/route.js");
    assert.match(src, /mode:\s*value\.modalidade/);
  });

  test("schema SQL aceita 'presencial' como valor válido de mode", () => {
    const sql = read("supabase/migrations/0001_create_bookings.sql");
    assert.match(sql, /mode in \('online', 'presencial'\)/);
  });

  test("GET /api/admin/agendamentos mapeia mode -> modalidade na listagem (não perde/renomeia errado)", () => {
    const src = read("app/api/admin/agendamentos/route.js");
    assert.match(src, /modalidade:\s*b\.mode/);
  });

  test("AdminAgendamentosClient.js sabe rotular as duas modalidades (online e presencial)", () => {
    const src = read("components/admin/AdminAgendamentosClient.js");
    assert.match(src, /online:\s*["']Online["']/);
    assert.match(src, /presencial:\s*["']Presencial["']/);
  });
});

describe("9) FAQ confirma escolha de modalidade durante o agendamento (não manda combinar por fora)", () => {
  test("FAQ 'É presencial?' não manda mais falar pelo WhatsApp pra presencial", async () => {
    const { faqs } = await import("../config/content.js");
    const item = faqs.find((f) => f.q === "É presencial?");
    assert.doesNotMatch(item.a, /fale pelo whatsapp/i);
  });
});
