-- Migration 0001: reserva provisória com Pix + confirmação manual.
--
-- Como aplicar (Supabase Free):
--   1. Painel do projeto Supabase -> SQL Editor -> New query.
--   2. Colar o conteúdo INTEIRO deste arquivo e rodar (Run).
--   3. Repetir em qualquer outro ambiente (ex.: projeto de staging) que
--      precise da mesma estrutura -- este arquivo é idempotente
--      (create ... if not exists / create or replace), pode rodar de novo
--      sem quebrar nada se já tiver sido aplicado antes.
--
-- Sem cron: nenhuma rotina agendada apaga ou atualiza linhas vencidas.
-- A "expiração" é sempre calculada na hora da consulta, comparando
-- `expires_at` com `now()` -- ver a view `active_bookings` e as regras
-- dentro de cada função abaixo. Uma reserva PENDING_PAYMENT vencida
-- continua gravada na tabela (histórico), só deixa de contar como ativa.
--
-- IMPORTANTE (auditoria de segurança): este arquivo ainda NÃO foi
-- aplicado a nenhum projeto Supabase real neste momento -- foi revisado
-- e testado estruturalmente (ver tests/auditCorrections.test.js), mas
-- "testado estruturalmente" não é o mesmo que "testado de ponta a ponta
-- contra um Postgres de verdade". Antes de depender disso em produção,
-- aplique num projeto Supabase Free de teste e rode os cenários de
-- concorrência manualmente (duas abas, dois `select create_booking(...)`
-- pro MESMO horário) antes de apontar pro projeto real do Rafael.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabela (schema `public` explícito em toda referência deste arquivo --
-- nunca depende do search_path da sessão pra resolver "bookings").
-- ---------------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  public_code text not null,
  idempotency_key text,
  request_signature text,
  mode text not null check (mode in ('online', 'presencial')),
  booking_date date not null,
  booking_time text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  patient_name text not null,
  patient_email text not null,
  patient_phone text not null,
  commercial_terms_accepted_at timestamptz not null,
  status text not null default 'PENDING_PAYMENT'
    check (status in ('PENDING_PAYMENT', 'CONFIRMING', 'CONFIRMED', 'EXPIRED', 'PAYMENT_REJECTED', 'UNKNOWN')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  google_event_id text,
  google_meet_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- public_code precisa ser único, mas usamos índice único parcial em vez de
-- UNIQUE direto na coluna pra manter a mensagem de erro previsível
-- (unique_violation) e dar espaço a uma eventual futura soft-delete sem
-- reescrever a constraint.
create unique index if not exists idx_bookings_public_code on public.bookings (public_code);

-- idempotency_key só precisa ser único quando presente (não-nulo) -- duas
-- reservas sem chave de idempotência não são a "mesma tentativa". Esse
-- índice é a linha de defesa que resolve corrida de verdade entre duas
-- transações concorrentes com a MESMA chave (ver create_booking abaixo).
create unique index if not exists idx_bookings_idempotency_key
  on public.bookings (idempotency_key)
  where idempotency_key is not null;

-- Suporta a consulta mais comum: "existe reserva ativa/confirmada pra esse
-- horário exato?" e a listagem do painel admin por status/expiração.
create index if not exists idx_bookings_starts_at_status on public.bookings (starts_at, status);
create index if not exists idx_bookings_status_expires on public.bookings (status, expires_at);
create index if not exists idx_bookings_booking_date on public.bookings (booking_date);

create or replace function public.bookings_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
  before update on public.bookings
  for each row execute function public.bookings_set_updated_at();

-- Revoga o EXECUTE público desta função também -- por padrão o Postgres
-- concede EXECUTE em toda função nova pra PUBLIC. Isso NÃO impede o
-- gatilho de funcionar: o disparo de um trigger é decidido pelo
-- privilégio de UPDATE na TABELA (que já está corretamente restrito a
-- service_role acima), nunca pelo privilégio de EXECUTE na função em si
-- -- o Postgres invoca a função de gatilho internamente, independente
-- de quem fez o UPDATE ter ou não EXECUTE nela. Não há necessidade de
-- nenhum GRANT explícito depois deste REVOKE -- nenhum papel precisa
-- chamar esta função diretamente (nem faria sentido: ela só funciona
-- dentro do contexto de um gatilho, referenciando NEW/OLD).
revoke all on function public.bookings_set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS ligado, SEM nenhuma policy de leitura/escrita pública -- nenhuma
-- linha de public.bookings é acessível via `anon`/`authenticated`, nem
-- por PostgREST direto (GET/POST /rest/v1/bookings) nem por SQL. Toda
-- leitura/escrita passa OBRIGATORIAMENTE pelas funções SECURITY DEFINER
-- abaixo, chamadas só pelo backend (service_role). Isso é defesa em
-- profundidade: mesmo que uma chave errada vazasse pro cliente por
-- engano, não haveria nenhuma policy liberando acesso.
alter table public.bookings enable row level security;

-- Revoga qualquer privilégio direto na tabela e na view pros papéis
-- usados pelo PostgREST no lado do cliente. `service_role`, no Supabase,
-- tem BYPASSRLS e normalmente já recebe GRANT ALL ON ALL TABLES IN SCHEMA
-- public automaticamente pelo provisionamento padrão do projeto -- os
-- GRANTs explícitos abaixo são redundância intencional (deixam este
-- arquivo auto-suficiente e auditável, sem depender de um comportamento
-- implícito do provisionamento do Supabase).
revoke all on public.bookings from public, anon, authenticated;
-- DELETE incluído só para permitir limpeza de registros (ex.: dados
-- fictícios criados por scripts/verify-supabase-bookings.mjs, ou uma
-- futura rotina manual de retenção -- ver comentário no fim deste
-- arquivo). A aplicação em si (lib/booking/bookingRepository.js) nunca
-- deleta uma reserva real -- só marca estados terminais via as RPCs.
grant select, insert, update, delete on public.bookings to service_role;

-- ---------------------------------------------------------------------
-- View: reservas "ativas" sem depender de cron.
--
-- DEFINIÇÃO EXATA (autoridade única de "isso bloqueia o horário?",
-- usada tanto aqui quanto dentro de create_booking abaixo -- as duas
-- precisam ficar sempre em sincronia):
--   BLOQUEIA  = (status = 'PENDING_PAYMENT' AND expires_at > now())
--               OR status IN ('CONFIRMING', 'CONFIRMED', 'UNKNOWN')
--   NÃO bloqueia = PENDING_PAYMENT vencida, EXPIRED, PAYMENT_REJECTED.
-- UNKNOWN bloqueia porque pode já ter criado evento no Google sem termos
-- certeza -- nunca tratamos isso como livre.
-- ---------------------------------------------------------------------
create or replace view public.active_bookings
with (security_invoker = true) as
select *
from public.bookings
where
  (status = 'PENDING_PAYMENT' and expires_at > now())
  or status in ('CONFIRMING', 'CONFIRMED', 'UNKNOWN');

revoke all on public.active_bookings from public, anon, authenticated;
grant select on public.active_bookings to service_role;

-- ---------------------------------------------------------------------
-- RPC: create_booking
-- Cria a reserva provisória de forma atômica:
--   - Idempotência: mesma idempotency_key + mesma assinatura -> devolve a
--     reserva já existente (sem criar outra). Mesma chave + assinatura
--     DIFERENTE -> erro 'idempotency_conflict' (o chamador deve responder 409).
--   - Concorrência de slot: pg_advisory_xact_lock serializa, DENTRO da
--     transação, todas as tentativas para o MESMO starts_at -- a segunda
--     tentativa só continua depois que a primeira commitar ou fizer rollback,
--     e nesse ponto já enxerga o efeito da primeira (o exists-check abaixo
--     roda DEPOIS de adquirir o lock, nunca antes).
--   - Corrida na própria idempotency_key (dois requests concorrentes com a
--     mesma chave, nenhum viu o outro ainda no SELECT inicial) é resolvida
--     de DUAS formas complementares: (a) se as duas tentativas forem pro
--     MESMO horário, o advisory lock já as serializa, e a segunda re-checa
--     idempotência LOGO DEPOIS de adquirir o lock -- antes de sequer
--     avaliar "o horário está livre?" (nunca trata a própria tentativa
--     repetida como conflito de horário); (b) no caso geral (chaves iguais
--     mas horários diferentes, o que não deveria acontecer na prática já
--     que a assinatura amarra a chave ao horário, mas é tratado mesmo
--     assim), o índice único em idempotency_key garante que só um INSERT
--     vence -- o outro cai no bloco EXCEPTION, re-consulta e devolve a
--     linha que venceu.
-- ---------------------------------------------------------------------
create or replace function public.create_booking(
  p_public_code text,
  p_idempotency_key text,
  p_request_signature text,
  p_mode text,
  p_booking_date date,
  p_booking_time text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_patient_name text,
  p_patient_email text,
  p_patient_phone text,
  p_hold_minutes integer
) returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.bookings;
  v_new public.bookings;
  v_lock_key bigint;
begin
  -- ---------------------------------------------------------------
  -- Validações defensivas -- rodam ANTES de qualquer idempotência/lock,
  -- pra rejeitar entrada malformada o mais cedo possível (nunca chegam a
  -- acontecer numa chamada legítima da aplicação, que já valida tudo
  -- isso em JS antes de chamar a RPC -- isso aqui é a última linha de
  -- defesa, não a primeira).
  -- ---------------------------------------------------------------
  if p_hold_minutes is null or p_hold_minutes < 1 or p_hold_minutes > 120 then
    raise exception 'invalid_hold_minutes' using errcode = 'P0004';
  end if;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid_time_range' using errcode = 'P0005';
  end if;

  if p_public_code is null or length(trim(p_public_code)) = 0 then
    raise exception 'invalid_public_code' using errcode = 'P0006';
  end if;

  -- idempotency_key continua OPCIONAL (nula é válida -- ver comentário
  -- de create_booking) -- só recusa quando fornecida vazia/só espaços.
  if p_idempotency_key is not null and length(trim(p_idempotency_key)) = 0 then
    raise exception 'invalid_idempotency_key' using errcode = 'P0007';
  end if;

  if p_request_signature is null or length(trim(p_request_signature)) = 0 then
    raise exception 'invalid_request_signature' using errcode = 'P0008';
  end if;

  -- Formato HH:MM com faixa de hora VÁLIDA (00-23) -- o padrão anterior
  -- (^[0-2][0-9]:...) aceitava "24".."29" como primeiro dígito de hora
  -- só porque o primeiro caractere batia com [0-2] e o segundo com
  -- [0-9], sem checar a combinação (24:00, 27:30, 29:59 passariam).
  -- ([01][0-9]|2[0-3]) só aceita 00-19 (primeiro dígito 0 ou 1, segundo
  -- qualquer) OU 20-23 (primeiro dígito fixo 2, segundo 0-3).
  if p_booking_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'invalid_booking_time_format' using errcode = 'P0009';
  end if;

  -- Checagem GROSSEIRA de coerência entre booking_date e starts_at --
  -- de propósito NÃO reimplementa a conversão de fuso horário
  -- (America/Sao_Paulo) que já vive em lib/booking/timezone.js no lado
  -- da aplicação -- duplicar essa regra aqui seria fonte garantida de
  -- divergência futura (a regra muda num lugar, esquecem de mudar no
  -- outro). Em vez disso, só garante que a data "de exibição" não está
  -- a mais de 1 dia de distância da data UTC do instante real -- o
  -- suficiente pra pegar um erro grosseiro (mês/ano trocado, campos
  -- invertidos por engano), já que qualquer fuso plausível do mundo
  -- real fica dentro de ±1 dia de diferença de data em relação ao UTC.
  if abs(p_starts_at::date - p_booking_date) > 1 then
    raise exception 'inconsistent_booking_date' using errcode = 'P0010';
  end if;

  -- Checagem otimista de idempotência (evita pagar o custo do advisory
  -- lock quando a chave já é conhecida sem nenhuma corrida em curso). A
  -- checagem AUTORITATIVA -- a que realmente fecha a corrida -- é a que
  -- roda de novo logo depois de adquirir o lock, mais abaixo.
  if p_idempotency_key is not null then
    select * into v_existing from public.bookings where idempotency_key = p_idempotency_key;
    if found then
      if v_existing.request_signature is distinct from p_request_signature then
        raise exception 'idempotency_conflict' using errcode = 'P0001';
      end if;
      return v_existing;
    end if;
  end if;

  -- Chave do advisory lock: segundos desde a época Unix (UTC), extraídos
  -- de forma DETERMINÍSTICA e independente do timezone da sessão --
  -- extract(epoch from timestamptz) sempre calcula em UTC internamente,
  -- ao contrário de `p_starts_at::text` (cuja formatação muda conforme o
  -- TimeZone GUC da conexão/sessão -- duas conexões com TimeZone
  -- diferentes formatariam o MESMO instante como texto diferente, e um
  -- hash dessa formatação geraria chaves de lock DIFERENTES pro mesmo
  -- horário, quebrando a serialização). extract(epoch from ...) elimina
  -- esse problema por completo: é uma representação numérica única do
  -- instante, sem depender de nenhuma formatação textual. Os horários
  -- fixos da agenda (08:00/11:00/14:00/17:00) nunca coincidem no mesmo
  -- segundo entre si, então a granularidade de segundo não introduz
  -- colisão real neste domínio -- e mesmo que introduzisse, o efeito
  -- seria só uma serialização extra (falso positivo de "mesmo lock"),
  -- nunca a falha oposta (dois horários diferentes escapando do lock).
  v_lock_key := floor(extract(epoch from p_starts_at))::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Re-checagem de idempotência DEPOIS do lock: se outra transação para
  -- o MESMO horário, com a MESMA idempotency_key, terminou enquanto essa
  -- aqui esperava o lock, ela precisa devolver a reserva da outra --
  -- NUNCA cair no exists-check de slot_taken logo abaixo (isso geraria um
  -- falso conflito pra quem só está repetindo a própria tentativa,
  -- exatamente o cenário descrito no comentário da função acima).
  if p_idempotency_key is not null then
    select * into v_existing from public.bookings where idempotency_key = p_idempotency_key;
    if found then
      if v_existing.request_signature is distinct from p_request_signature then
        raise exception 'idempotency_conflict' using errcode = 'P0001';
      end if;
      return v_existing;
    end if;
  end if;

  -- Definição EXATA de "esse horário está bloqueado" -- precisa ficar
  -- sempre em sincronia com public.active_bookings (ver comentário da view).
  if exists (
    select 1 from public.bookings
    where starts_at = p_starts_at
      and (
        (status = 'PENDING_PAYMENT' and expires_at > now())
        or status in ('CONFIRMING', 'CONFIRMED', 'UNKNOWN')
      )
  ) then
    raise exception 'slot_taken' using errcode = 'P0002';
  end if;

  begin
    insert into public.bookings (
      public_code, idempotency_key, request_signature, mode, booking_date, booking_time,
      starts_at, ends_at, patient_name, patient_email, patient_phone,
      commercial_terms_accepted_at, status, expires_at
    ) values (
      p_public_code, p_idempotency_key, p_request_signature, p_mode, p_booking_date, p_booking_time,
      p_starts_at, p_ends_at, p_patient_name, p_patient_email, p_patient_phone,
      now(), 'PENDING_PAYMENT', now() + (p_hold_minutes || ' minutes')::interval
    ) returning * into v_new;
  exception when unique_violation then
    if p_idempotency_key is not null then
      select * into v_existing from public.bookings where idempotency_key = p_idempotency_key;
      if found then
        if v_existing.request_signature is distinct from p_request_signature then
          raise exception 'idempotency_conflict' using errcode = 'P0001';
        end if;
        return v_existing;
      end if;
    end if;
    -- Colisão foi no public_code (extremamente raro, 8 chars num alfabeto
    -- de 32) -- o chamador deve gerar outro código e tentar de novo.
    raise exception 'public_code_conflict' using errcode = 'P0003';
  end;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: begin_confirmation
-- Transição atômica PENDING_PAYMENT -> CONFIRMING. SÓ aceita a transição
-- se, no momento exato do UPDATE: status = 'PENDING_PAYMENT' E
-- expires_at > now() -- as DUAS condições avaliadas ATOMICAMENTE pelo
-- próprio WHERE da instrução (não há SELECT seguido de UPDATE separado
-- em momentos diferentes, que abriria uma janela de corrida). Se a
-- reserva já venceu, o WHERE simplesmente não bate em NENHUMA linha --
-- `won` vem false e a segurança da recusa NÃO depende de nenhuma escrita
-- adicional (a atualização oportunista para EXPIRED, feita a seguir,
-- é só cosmética/informativa para o painel admin, nunca faz parte do
-- mecanismo de segurança).
--
-- `won = true` só para QUEM de fato fez a transição agora -- se duas
-- confirmações administrativas disparam ao mesmo tempo, o UPDATE trava a
-- linha e só a primeira a commitar enxerga `status = 'PENDING_PAYMENT'`;
-- a segunda, ao continuar, já vê `status = 'CONFIRMING'` (ou `EXPIRED`,
-- se o prazo venceu no meio tempo) e não bate no WHERE -- então
-- `won = false` pra ela.
-- ---------------------------------------------------------------------
create or replace function public.begin_confirmation(p_id uuid, out won boolean, out booking public.bookings)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.bookings
  set status = 'CONFIRMING'
  where id = p_id and status = 'PENDING_PAYMENT' and expires_at > now()
  returning * into booking;

  if found then
    won := true;
    return;
  end if;

  won := false;

  -- Best-effort, puramente informativo pro painel admin (nunca faz parte
  -- da checagem de segurança acima, que já recusou atomicamente). Se uma
  -- reserva PENDING_PAYMENT venceu, marca EXPIRED aqui; se falhar por
  -- qualquer motivo, o SELECT abaixo ainda devolve o estado real da linha.
  update public.bookings
  set status = 'EXPIRED'
  where id = p_id and status = 'PENDING_PAYMENT' and expires_at <= now()
  returning * into booking;

  if not found then
    select * into booking from public.bookings where id = p_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: finalize_confirmation
-- CONFIRMING -> CONFIRMED, grava google_event_id/meet/confirmed_at.
-- Repetir a chamada numa reserva já CONFIRMED simplesmente devolve a
-- MESMA linha (idempotente) -- nunca sobrescreve google_event_id, então
-- nunca corre risco de "perder" a referência de um evento já criado.
--
-- CORREÇÃO DE CORRIDA RESIDUAL (auditoria de concorrência, 2ª rodada):
-- a versão anterior fazia um SELECT pra ler o status ANTES de decidir se
-- rodava o UPDATE. Isso deixava uma janela real: duas chamadas
-- concorrentes podiam AMBAS fazer SELECT e ler CONFIRMING antes de
-- qualquer uma escrever; a primeira UPDATE vencia e virava CONFIRMED; a
-- segunda UPDATE (WHERE status='CONFIRMING') não encontrava mais
-- nenhuma linha -- e, pior, `RETURNING INTO v` numa instrução que afeta
-- ZERO linhas ZERA os campos de `v` (não preserva o valor do SELECT
-- anterior), então a segunda chamada podia devolver uma linha vazia em
-- vez do resultado CONFIRMED de verdade -- quebrando a promessa de
-- idempotência sob concorrência.
--
-- A correção: NENHUM SELECT roda antes do UPDATE. A PRIMEIRA instrução
-- executada é o próprio UPDATE, com TODA a validação (evento presente,
-- Meet no host exato do Google Meet pra reservas online) dentro do
-- MESMO WHERE. O Postgres serializa automaticamente dois UPDATEs
-- concorrentes na MESMA linha via lock de linha -- a segunda transação
-- só continua depois que a primeira commitar, e nesse momento reavalia
-- o WHERE contra o estado JÁ ATUALIZADO pela primeira (status não é
-- mais 'CONFIRMING'), então nunca vence e nunca sobrescreve nada. Se o
-- UPDATE não afetar nenhuma linha (por qualquer motivo -- já estava
-- CONFIRMED, estava em outro estado, validação falhou, ou o id não
-- existe), SÓ ENTÃO um SELECT busca o estado ATUAL e o devolve -- nunca
-- confiando num valor lido antes da tentativa de escrita.
--
-- Validações dentro do WHERE:
--   - p_google_event_id não pode ser nulo nem vazio (btrim <> '');
--   - se a reserva é mode='online' (a única modalidade que gera Google
--     Meet -- ver app/api/admin/agendamentos/[id]/confirmar/route.js),
--     p_google_meet_url precisa pertencer EXATAMENTE ao host HTTPS do
--     Google Meet (começar com "https://meet.google.com/") -- nunca
--     aceita outro domínio nem http://; reservas mode='presencial' não
--     têm Meet, então o WHERE nem exige meet_url pra elas.
-- ---------------------------------------------------------------------
create or replace function public.finalize_confirmation(
  p_id uuid,
  p_google_event_id text,
  p_google_meet_url text
) returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.bookings;
begin
  update public.bookings
  set status = 'CONFIRMED',
      google_event_id = p_google_event_id,
      google_meet_url = p_google_meet_url,
      confirmed_at = now()
  where id = p_id
    and status = 'CONFIRMING'
    and p_google_event_id is not null
    and btrim(p_google_event_id) <> ''
    and (
      mode <> 'online'
      or (p_google_meet_url is not null and p_google_meet_url like 'https://meet.google.com/%')
    )
  returning * into v;

  if found then
    return v;
  end if;

  -- O UPDATE acima não afetou nenhuma linha. Busca e devolve o estado
  -- REAL e ATUAL da linha -- nunca reaproveita nenhum dado lido antes
  -- da tentativa de escrita:
  --   - já CONFIRMED (idempotência: outra chamada, concorrente ou
  --     anterior, já confirmou) -> devolve a linha confirmada, com os
  --     dados do Google de quem realmente venceu, sem sobrescrever nada;
  --   - CONFIRMING mas validação falhou (evento vazio, Meet fora do
  --     host esperado) -> continua CONFIRMING, sem alteração;
  --   - qualquer outro status -> permanece inalterado;
  --   - id inexistente -> devolve registro vazio (mesmo comportamento
  --     das demais RPCs desta migration).
  select * into v from public.bookings where id = p_id;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: revert_to_pending
-- Usado quando a escrita no Google FALHOU de forma comprovadamente
-- anterior a qualquer efeito (ex.: erro de rede antes do request sair).
-- Só volta pra PENDING_PAYMENT se o prazo ainda não venceu nesse meio
-- tempo -- se venceu, marca EXPIRED em vez de "reabrir" um prazo já
-- estourado.
-- ---------------------------------------------------------------------
create or replace function public.revert_to_pending(p_id uuid) returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.bookings;
begin
  update public.bookings
  set status = 'PENDING_PAYMENT'
  where id = p_id and status = 'CONFIRMING' and expires_at > now()
  returning * into v;

  if not found then
    update public.bookings
    set status = 'EXPIRED'
    where id = p_id and status = 'CONFIRMING' and expires_at <= now()
    returning * into v;

    if not found then
      select * into v from public.bookings where id = p_id;
    end if;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: mark_unknown
-- Usado quando a escrita no Google é AMBÍGUA (ex.: timeout depois do
-- request sair, sem confirmação se foi aceito do outro lado). Nunca
-- repete a criação automaticamente -- fica UNKNOWN até um humano revisar
-- manualmente no Google Calendar e no painel.
-- ---------------------------------------------------------------------
create or replace function public.mark_unknown(p_id uuid) returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.bookings;
begin
  update public.bookings set status = 'UNKNOWN'
  where id = p_id and status = 'CONFIRMING'
  returning * into v;

  if not found then
    select * into v from public.bookings where id = p_id;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: reject_booking
-- Ação manual do Rafael: "Marcar pagamento não identificado".
--
-- CORREÇÃO DE SEGURANÇA (auditoria de concorrência): só aceita a
-- transição a partir de PENDING_PAYMENT -- NUNCA a partir de CONFIRMING.
-- Antes desta correção, rejeitar aceitava `status in ('PENDING_PAYMENT',
-- 'CONFIRMING')`, o que abria uma corrida real: um administrador clica
-- "Confirmar sinal recebido" (a reserva vira CONFIRMING e a chamada ao
-- Google Calendar começa), e ANTES dela terminar, alguém (ex.: outra
-- aba do mesmo admin, ou uma segunda ação administrativa) clica
-- "Marcar pagamento não identificado" na mesma reserva -- reject_booking
-- mudava CONFIRMING -> PAYMENT_REJECTED enquanto o evento ainda podia
-- estar sendo criado do lado do Google. Quando finalize_confirmation
-- rodasse depois, o WHERE `status = 'CONFIRMING'` não bateria mais (a
-- linha já era PAYMENT_REJECTED), e o resultado seria um evento
-- REALMENTE criado no Google Calendar (com Meet e convite) enquanto o
-- banco mostra a reserva como rejeitada -- exatamente a inconsistência
-- que o item 2 desta auditoria manda impedir. Restringir a apenas
-- PENDING_PAYMENT fecha essa corrida na origem: uma vez que
-- begin_confirmation move a linha pra CONFIRMING, reject_booking nunca
-- mais consegue tocar nela (só finalize_confirmation, revert_to_pending
-- ou mark_unknown conseguem, e todas as três só são chamadas pela MESMA
-- requisição administrativa que iniciou a confirmação -- nunca por uma
-- ação concorrente independente).
-- ---------------------------------------------------------------------
create or replace function public.reject_booking(p_id uuid) returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.bookings;
begin
  update public.bookings set status = 'PAYMENT_REJECTED'
  where id = p_id and status = 'PENDING_PAYMENT'
  returning * into v;

  if not found then
    select * into v from public.bookings where id = p_id;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- Trava de acesso das funções: PostgREST expõe RPCs por padrão pros
-- papéis anon/authenticated (o Postgres concede EXECUTE em funções pra
-- PUBLIC por padrão). Este projeto só usa a service_role key no
-- servidor -- nunca o anon key -- mas os REVOKE/GRANT abaixo tornam isso
-- explícito e à prova de erro de configuração futura, em vez de
-- depender só da convenção "nunca expor a service_role key".
-- ---------------------------------------------------------------------
revoke all on function public.create_booking(text, text, text, text, date, text, timestamptz, timestamptz, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.begin_confirmation(uuid) from public, anon, authenticated;
revoke all on function public.finalize_confirmation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.revert_to_pending(uuid) from public, anon, authenticated;
revoke all on function public.mark_unknown(uuid) from public, anon, authenticated;
revoke all on function public.reject_booking(uuid) from public, anon, authenticated;

grant execute on function public.create_booking(text, text, text, text, date, text, timestamptz, timestamptz, text, text, text, integer) to service_role;
grant execute on function public.begin_confirmation(uuid) to service_role;
grant execute on function public.finalize_confirmation(uuid, text, text) to service_role;
grant execute on function public.revert_to_pending(uuid) to service_role;
grant execute on function public.mark_unknown(uuid) to service_role;
grant execute on function public.reject_booking(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Limpeza/backup de registros vencidos (NÃO implementado nesta fase):
-- como não há cron nem serviço pago, linhas antigas (EXPIRED,
-- PAYMENT_REJECTED, PENDING_PAYMENT vencidas há muito tempo) continuam na
-- tabela indefinidamente -- o volume esperado é baixo (poucas reservas por
-- dia), então isso não é um problema imediato de custo/performance no
-- plano Free. Se algum dia crescer, um candidato futuro (não implementado
-- agora) seria uma rotina manual/periódica de export + delete das linhas
-- com status terminal (EXPIRED/PAYMENT_REJECTED) mais antigas que N meses,
-- rodada manualmente pelo SQL Editor -- sem precisar de nenhum serviço de
-- cron pago.
