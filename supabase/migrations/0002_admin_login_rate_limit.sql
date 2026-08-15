-- Migration 0002 (PROPOSTA -- ainda NÃO aplicada em nenhum projeto
-- Supabase, nem sequer amarrada ao código da aplicação): limite de
-- tentativas de login do painel administrativo, persistente no Postgres
-- em vez de só em memória (lib/booking/rateLimit.js), pra funcionar de
-- verdade entre instâncias serverless diferentes da Vercel.
--
-- POR QUE ISSO EXISTE: o Rafael escolheu conscientemente uma senha de
-- 4 dígitos (decisão de negócio, registrada e respeitada -- ver
-- lib/admin/session.js). Isso reduz MUITO o espaço de tentativas
-- possíveis (10 mil combinações). O limite em memória já existente
-- (5 tentativas/minuto) ajuda, mas tem uma limitação real: cada
-- instância serverless da Vercel tem sua PRÓPRIA memória, então um
-- atacante distribuído (ou só com má sorte/muitas requisições) pode, na
-- prática, tentar mais que 5/min se cair em instâncias diferentes. Um
-- limite persistente no banco fecha essa lacuna.
--
-- REVISÃO 2 (esta versão): a primeira proposta tinha uma corrida
-- TOCTOU (time-of-check-time-of-use) real -- separava a checagem
-- ("admin_login_is_locked", uma leitura) do registro da falha
-- ("admin_login_register_failure", uma escrita), como DUAS chamadas
-- RPC distintas feitas em momentos diferentes da rota. O contador em si
-- nunca perdia incrementos (o UPSERT já era atômico), mas isso não
-- provava que só 5 requisições chegavam a comparar a senha: muitas
-- requisições concorrentes podiam passar pela checagem de "não
-- bloqueado" ANTES de qualquer uma delas registrar sua falha,
-- multiplicando na prática o número de tentativas de senha aceitas
-- antes do bloqueio surtir efeito.
--
-- CORREÇÃO: uma ÚNICA função, `admin_login_consume_attempt`, substitui
-- as duas antigas (`admin_login_is_locked` e
-- `admin_login_register_failure`). Ela LÊ o estado atual da linha e
-- DECIDE/ESCREVE o novo estado sob o MESMO lock de linha Postgres
-- (`select ... for update`), dentro da MESMA transação implícita da
-- chamada RPC -- nenhuma outra chamada concorrente pra essa MESMA
-- attempt_key consegue ler um estado "antigo" enquanto essa decisão
-- está em andamento; ela simplesmente espera a transação em andamento
-- terminar, e só então lê o estado já atualizado. Isso fecha a janela
-- TOCTOU: é fisicamente impossível mais de 5 chamadas concorrentes (pra
-- MESMA chave) obterem allowed=true antes do bloqueio entrar em vigor,
-- porque elas nunca processam em paralelo de verdade -- serializam no
-- lock de linha. Chaves DIFERENTES nunca se bloqueiam entre si (lock é
-- por linha, não da tabela inteira).
--
-- A tentativa é "consumida" (contada) ANTES da senha ser comparada --
-- o chamador (app/api/admin/agendamentos/login/route.js) só compara a
-- senha se `allowed = true`. Se a senha estiver errada, o chamador NÃO
-- chama o RPC de novo (a tentativa já foi contada no consume).
--
-- COMO ISSO NÃO BLOQUEIA O PRÓPRIO RAFAEL (pergunta obrigatória desta
-- auditoria): a chave de controle (`attempt_key`) é um HMAC-SHA-256
-- (calculado em JavaScript, com o segredo BOOKING_ADMIN_SESSION_SECRET,
-- ANTES de chegar ao Postgres -- este arquivo nunca vê o IP em texto
-- puro) de ("admin-login:" + IP normalizado de quem está tentando) --
-- ou seja, o contador é POR IP, nunca um contador único e global do
-- painel. Um atacante errando a senha do IP dele só bloqueia o IP DELE
-- por 30 minutos -- nunca o IP do Rafael, que produz uma attempt_key
-- completamente diferente. A única forma de isso afetar o Rafael é se
-- ELE MESMO errar a senha 5 vezes seguidas do próprio IP dele
-- (autoinfligido, expira sozinho em 30 minutos, sem precisar de
-- ninguém destravar manualmente) -- ou se ele estiver atrás do MESMO IP
-- público que um atacante (ex.: mesma rede/NAT compartilhado), que é
-- uma limitação inerente de qualquer controle por IP, documentada aqui
-- e já presente no limite em memória existente. Um atacante distribuído
-- usando MUITOS IPs diferentes ainda consegue, em teoria, somar mais de
-- 5 tentativas totais (cada IP tem seu próprio orçamento de 5) -- isso
-- é uma limitação conhecida de qualquer rate limit por IP sem
-- infraestrutura paga de detecção de abuso (ex.: Cloudflare/WAF), fora
-- do escopo desta V1; ver risco residual documentado na entrega desta
-- proposta.
--
-- SEM CRON: igual ao resto deste projeto, não existe nenhuma rotina
-- apagando ou reciclando linhas vencidas. Um bloqueio "expira" só
-- porque toda leitura compara `locked_until` com `now()` -- depois que
-- esse instante passa, a PRÓPRIA função reinicia a janela na chamada
-- seguinte, mesmo que a linha continue gravada.
--
-- NENHUM DADO PESSOAL: `attempt_key` é um HMAC-SHA-256 (64 caracteres
-- hex) -- nunca guarda o IP em texto puro nem de forma reversível sem o
-- segredo. Não há nome, e-mail, telefone nem qualquer dado de paciente
-- nesta tabela.
--
-- STATUS: proposta apresentada para aprovação. Nada neste arquivo foi
-- executado contra nenhum Supabase real. O código da aplicação
-- (app/api/admin/agendamentos/login/route.js) ainda NÃO chama nada
-- daqui -- só passa a chamar depois que este arquivo for revisado,
-- aprovado e aplicado manualmente no SQL Editor do Supabase (mesmo
-- processo já usado pra 0001_create_bookings.sql).

-- ---------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------
create table if not exists public.admin_login_attempts (
  attempt_key text primary key,
  attempt_count integer not null default 0,
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.admin_login_attempts_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_admin_login_attempts_updated_at on public.admin_login_attempts;
create trigger trg_admin_login_attempts_updated_at
  before update on public.admin_login_attempts
  for each row execute function public.admin_login_attempts_set_updated_at();

revoke all on function public.admin_login_attempts_set_updated_at() from public, anon, authenticated;

-- RLS ligada, sem NENHUMA policy -- mesma defesa em profundidade da
-- migration 0001: ninguém (anon/authenticated) lê ou escreve aqui, nem
-- por engano, nem via PostgREST direto.
alter table public.admin_login_attempts enable row level security;
revoke all on public.admin_login_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.admin_login_attempts to service_role;

-- ---------------------------------------------------------------------
-- RPC: admin_login_consume_attempt
--
-- ÚNICA operação atômica que decide "esta tentativa pode prosseguir?" E
-- já registra o consumo, no mesmo passo. Fluxo:
--
--   1. Garante que a linha existe (INSERT ... ON CONFLICT DO NOTHING --
--      idempotente, não decide nada sozinho).
--   2. TRAVA a linha com `select ... for update`. Qualquer outra chamada
--      concorrente pra MESMA attempt_key bloqueia exatamente aqui até
--      esta transação terminar -- é isso que fecha a janela TOCTOU: a
--      leitura do estado atual e a escrita do novo estado acontecem sob
--      o MESMO lock, sem nenhuma brecha onde outra chamada "passe por
--      baixo" enquanto esta decide.
--   3. Se já está bloqueada (locked_until no futuro): recusa
--      (allowed = false), SEM incrementar mais (evita o contador crescer
--      à toa e evita estender o bloqueio a cada nova tentativa recebida
--      enquanto já bloqueado).
--   4. Se o bloqueio anterior já expirou: reinicia a janela (contador
--      volta a 1, como se fosse a primeira tentativa de novo).
--   5. Caso contrário: incrementa o contador. Se o incremento atingir 5,
--      define locked_until = now() + 30 minutos -- mas essa MESMA
--      chamada (a 5ª) ainda é permitida (allowed = true); só a 6ª em
--      diante, que já encontra locked_until no futuro no passo 3, é
--      recusada.
--
-- Retorna (allowed boolean, remaining_attempts integer) -- nunca expõe
-- failure_count bruto nem locked_until pro chamador; só o suficiente
-- pra decidir se segue ou não.
--
-- BOOTSTRAP (primeira tentativa de uma attempt_key que ainda NÃO existe
-- na tabela) -- pergunta obrigatória desta revisão: `select ... for
-- update` não trava uma linha que ainda não existe, então o que
-- serializa DUAS chamadas simultâneas para uma chave inédita? A ordem
-- de operações dentro desta função (idêntica à ordem pedida: validar a
-- chave -> INSERT ... ON CONFLICT DO NOTHING -> SELECT ... FOR UPDATE ->
-- decidir -> UPDATE -> RETURN) resolve isso porque o PRÓPRIO INSERT já
-- serializa via o índice único de `attempt_key` (chave primária):
--   1. As duas chamadas concorrentes executam o INSERT quase ao mesmo
--      tempo. O Postgres processa inserções conflitantes na MESMA chave
--      uma de cada vez -- a primeira a chegar insere a linha de
--      verdade; a segunda, ao tentar inserir a MESMA chave primária,
--      colide no índice único e FICA ESPERANDO a transação da primeira
--      terminar (commit ou rollback) antes de resolver seu próprio
--      ON CONFLICT DO NOTHING (que então vira um no-op, pois a linha já
--      existe).
--   2. Só depois de resolvido o INSERT (nas duas chamadas, em ordem) é
--      que cada uma chega ao SELECT ... FOR UPDATE -- e a essa altura a
--      linha JÁ EXISTE pras duas, então o FOR UPDATE passa a valer
--      normalmente como lock de linha, na mesma ordem em que os INSERTs
--      foram resolvidos.
--   3. Ou seja: o índice único da chave primária faz o papel do lock
--      "antes da linha existir"; o FOR UPDATE assume o papel do lock
--      "depois que a linha existe". As duas chamadas nunca processam a
--      decisão (passos 3-5 acima) em paralelo de verdade, mesmo na
--      primeiríssima tentativa de uma chave nova -- exatamente a mesma
--      garantia do caso "linha já existente", só que a serialização
--      acontece um passo mais cedo. Resultado prático: mesmo em rajada
--      de 20 chamadas simultâneas contra uma chave que nunca existiu
--      antes, no máximo 5 retornam allowed = true (ver cenário
--      dedicado no script de verificação, seção "bootstrap").
-- ---------------------------------------------------------------------
create or replace function public.admin_login_consume_attempt(p_attempt_key text)
returns table(allowed boolean, remaining_attempts integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.admin_login_attempts;
  v_new_count integer;
  v_new_locked_until timestamptz;
begin
  if p_attempt_key is null or btrim(p_attempt_key) = '' then
    allowed := false;
    remaining_attempts := 0;
    return next;
    return;
  end if;

  insert into public.admin_login_attempts (attempt_key, attempt_count, locked_until, last_attempt_at)
  values (p_attempt_key, 0, null, now())
  on conflict (attempt_key) do nothing;

  -- Trava a linha AGORA -- ponto central da correção do TOCTOU. Toda
  -- chamada concorrente pra mesma chave serializa aqui.
  select * into v_row
  from public.admin_login_attempts
  where attempt_key = p_attempt_key
  for update;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    -- Já bloqueado: recusa sem consumir mais uma tentativa. Só atualiza
    -- o carimbo de "última tentativa vista" (informativo, não afeta a
    -- decisão de ninguém).
    update public.admin_login_attempts
    set last_attempt_at = now()
    where attempt_key = p_attempt_key;

    allowed := false;
    remaining_attempts := 0;
    return next;
    return;
  end if;

  if v_row.locked_until is not null and v_row.locked_until <= now() then
    -- Bloqueio anterior expirado -- reinicia a janela.
    v_new_count := 1;
  else
    v_new_count := v_row.attempt_count + 1;
  end if;

  if v_new_count >= 5 then
    v_new_locked_until := now() + interval '30 minutes';
  else
    v_new_locked_until := null;
  end if;

  update public.admin_login_attempts
  set attempt_count = v_new_count,
      locked_until = v_new_locked_until,
      last_attempt_at = now()
  where attempt_key = p_attempt_key;

  allowed := true; -- a própria tentativa que cruza o limite ainda é permitida
  remaining_attempts := greatest(5 - v_new_count, 0);
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: admin_login_register_success
-- Reset completo após autenticação válida -- remove a linha (não deixa
-- histórico de tentativas antigas pesando numa próxima tentativa
-- legítima).
-- ---------------------------------------------------------------------
create or replace function public.admin_login_register_success(p_attempt_key text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.admin_login_attempts where attempt_key = p_attempt_key;
$$;

-- ---------------------------------------------------------------------
-- Trava de acesso das funções -- mesmo padrão da migration 0001: nada
-- exposto a anon/authenticated, execução só pra service_role (chamada
-- exclusivamente pelo backend deste projeto com a service role key).
-- ---------------------------------------------------------------------
revoke all on function public.admin_login_consume_attempt(text) from public, anon, authenticated;
revoke all on function public.admin_login_register_success(text) from public, anon, authenticated;

grant execute on function public.admin_login_consume_attempt(text) to service_role;
grant execute on function public.admin_login_register_success(text) to service_role;
