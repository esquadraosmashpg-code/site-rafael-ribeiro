// Identificador do "solicitante" usado para chavear o limite de
// tentativas do login admin (ver lib/admin/loginAttemptKey.js e
// supabase/migrations/0002_admin_login_rate_limit.sql). Deliberadamente
// NÃO é "pegue o IP de qualquer jeito que der" -- é uma política restrita,
// pensada especificamente para esse uso sensível (chave de um limitador
// de tentativas de senha), com duas regras fixas e sem meio-termo:
//
//   EM PRODUÇÃO (Vercel): usa EXCLUSIVAMENTE o cabeçalho
//   `x-vercel-forwarded-for`, escrito pela própria plataforma na borda.
//   NUNCA cai para `x-forwarded-for` como alternativa -- esse cabeçalho é
//   livremente forjável por qualquer cliente (ver seção "por que não
//   confiar em x-forwarded-for" abaixo), e aceitá-lo como fallback
//   reabriria exatamente o problema que motivou preferir o cabeçalho da
//   Vercel em primeiro lugar: um atacante que sabe que o cabeçalho
//   "oficial" às vezes falta poderia se garantir enviando um
//   x-forwarded-for forjado, na esperança de cair no fallback. Se o
//   cabeçalho da Vercel estiver ausente ou vier com um valor inválido,
//   usa um "balde" fixo (ainda protegido pelo HMAC no passo seguinte,
//   nunca em texto puro) -- nunca trava com erro 500, nunca inventa um
//   IP. IP enviado no corpo da requisição, na query string ou em cookie
//   NUNCA é considerado -- só esse único cabeçalho HTTP escrito pela
//   infraestrutura da Vercel.
//
//   EM DESENVOLVIMENTO LOCAL (qualquer NODE_ENV diferente de
//   "production"): usa um identificador FIXO ("local-development"),
//   ignorando completamente qualquer cabeçalho enviado pelo
//   navegador/cliente. Não existe proxy de borda confiável em dev local
//   -- qualquer coisa que o processo local receba em x-forwarded-for é,
//   por definição, algo que o próprio desenvolvedor (ou um script de
//   teste) decidiu mandar, não uma informação de rede confiável. Todo
//   mundo em dev local cai no MESMO identificador -- não é uma proteção
//   contra abuso localmente (não faz sentido nesse ambiente), é só o
//   suficiente para exercitar o fluxo de ponta a ponta e os testes.
//
// POR QUE NÃO CONFIAR EM x-forwarded-for (mesmo como fallback): esse
// cabeçalho é uma lista de "quem retransmitiu essa requisição", da
// esquerda (mais distante) pra direita (mais perto do servidor final).
// QUALQUER cliente pode mandar seu próprio x-forwarded-for já
// preenchido com um valor forjado -- mesmo que um proxy honesto ANEXE o
// IP real no final da lista, o próprio fato de aceitar esse cabeçalho
// como fonte de verdade abre espaço para ambiguidade (qual posição da
// lista é a "certa"?) que o cabeçalho dedicado da Vercel não tem.

const PRODUCTION_UNKNOWN_BUCKET = "unknown-production";
const LOCAL_DEVELOPMENT_IDENTIFIER = "local-development";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

// Identificador confiável do solicitante, pronto para entrar no HMAC em
// lib/admin/loginAttemptKey.js. Nunca lança, nunca devolve o IP bruto
// sem passar por normalização, nunca olha corpo/query/cookie.
export function getAdminLoginIdentifier(request) {
  if (!isProduction()) {
    return LOCAL_DEVELOPMENT_IDENTIFIER;
  }

  const vercelHeader = request.headers.get("x-vercel-forwarded-for");
  if (vercelHeader) {
    const first = vercelHeader.split(",")[0]?.trim();
    const normalized = first ? normalizeIp(first) : "";
    if (normalized && normalized !== "unknown") return normalized;
  }

  // Cabeçalho ausente ou com valor vazio/inválido -- balde fixo, ainda
  // protegido pelo HMAC. Todas as requisições nessa condição rara (só
  // aconteceria se a própria Vercel parasse de mandar o cabeçalho)
  // compartilham o mesmo orçamento de 5 tentativas -- pior caso é um
  // bloqueio mais cedo para esse grupo, nunca uma brecha de segurança.
  return PRODUCTION_UNKNOWN_BUCKET;
}

// Normaliza um endereço IP antes de usá-lo como entrada do HMAC: remove
// porta eventualmente anexada, colchetes de IPv6, caixa alta, e
// converte o formato IPv4-mapeado-em-IPv6 (::ffff:1.2.3.4) pra forma
// IPv4 pura -- sem isso, o mesmo cliente poderia contar como duas
// identidades diferentes dependendo de qual formato o proxy escolheu
// usar naquela requisição.
export function normalizeIp(rawIp) {
  let value = String(rawIp || "").trim().toLowerCase();
  if (!value) return "unknown";

  if (value.startsWith("[")) {
    // "[::1]:5678" -- IPv6 com porta entre colchetes.
    const end = value.indexOf("]");
    if (end > -1) value = value.slice(1, end);
  } else {
    // "1.2.3.4:5678" -- IPv4 com porta (tem ':' e '.' ao mesmo tempo,
    // diferente de um IPv6 puro, que tem vários ':' e nenhum '.').
    const colonCount = (value.match(/:/g) || []).length;
    if (colonCount === 1 && value.includes(".")) {
      value = value.split(":")[0];
    }
  }

  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];

  return value;
}
