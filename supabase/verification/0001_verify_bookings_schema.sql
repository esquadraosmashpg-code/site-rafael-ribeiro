-- Verificação 0001: checagem SOMENTE LEITURA do schema instalado por
-- supabase/migrations/0001_create_bookings.sql.
--
-- Como usar: depois de aplicar a migration no SQL Editor do Supabase,
-- cole e rode este arquivo inteiro (ou bloco por bloco). O resultado
-- principal é o primeiro SELECT (resumo A-K, uma linha por verificação,
-- com PASS/FAIL). Os dois SELECTs finais (L e M) mostram a DEFINIÇÃO de
-- objetos do banco (texto de código, não dado) -- úteis pra conferência
-- visual, não fazem parte do resumo PASS/FAIL.
--
-- Este arquivo é seguro para rodar quantas vezes quiser, a qualquer
-- momento, inclusive com reservas reais já gravadas: ele só consulta
-- pg_catalog/information_schema (metadados do banco -- estrutura de
-- tabelas, views, funções, índices, permissões) e usa pg_get_viewdef()/
-- pg_get_functiondef() (definição em texto de objetos do banco). Em
-- NENHUM momento ele faz SELECT * (nem qualquer coluna) da tabela
-- public.bookings em si -- nunca consulta nem retorna nome, e-mail,
-- telefone, WhatsApp, código público ou qualquer outro dado de uma
-- reserva real. Não contém INSERT, UPDATE, DELETE, TRUNCATE, nenhum
-- comando de remoção de objeto, nenhum comando de criação/alteração de
-- objeto, nem concessão/revogação de permissão -- só leitura.

-- =====================================================================
-- A) até K) -- resumo consolidado, uma linha por verificação
-- =====================================================================
with rpc_signatures(rpc_name, rpc_signature) as (
  values
    ('create_booking', 'create_booking(text,text,text,text,date,text,timestamptz,timestamptz,text,text,text,integer)'),
    ('begin_confirmation', 'begin_confirmation(uuid)'),
    ('finalize_confirmation', 'finalize_confirmation(uuid,text,text)'),
    ('revert_to_pending', 'revert_to_pending(uuid)'),
    ('mark_unknown', 'mark_unknown(uuid)'),
    ('reject_booking', 'reject_booking(uuid)')
),
checks as (

  -- A) tabela public.bookings existe
  select
    'A) tabela public.bookings existe' as check_name,
    exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'bookings' and table_type = 'BASE TABLE'
    ) as passed,
    'information_schema.tables' as detail

  union all
  -- B) view public.active_bookings existe
  select
    'B) view public.active_bookings existe',
    exists (
      select 1 from information_schema.views
      where table_schema = 'public' and table_name = 'active_bookings'
    ),
    'information_schema.views'

  union all
  -- C) RLS habilitada em public.bookings
  select
    'C) RLS habilitada em public.bookings',
    coalesce((
      select relrowsecurity from pg_catalog.pg_class
      where oid = to_regclass('public.bookings')
    ), false),
    'pg_class.relrowsecurity'

  union all
  -- D) ausência de policies na tabela (nenhuma policy pública ou de outro tipo)
  select
    'D) nenhuma policy em public.bookings',
    not exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'bookings'
    ),
    'pg_policies (esperado: 0 linhas)'

  union all
  -- E) existência das 6 RPCs
  select
    'E) RPC ' || rpc_name || ' existe',
    to_regprocedure('public.' || rpc_signature) is not null,
    'to_regprocedure(public.' || rpc_signature || ')'
  from rpc_signatures

  union all
  -- F) SECURITY DEFINER nas 6 RPCs
  select
    'F) SECURITY DEFINER em ' || rpc_name,
    coalesce((
      select p.prosecdef
      from pg_catalog.pg_proc p
      where p.oid = to_regprocedure('public.' || rpc_signature)
    ), false),
    'pg_proc.prosecdef'
  from rpc_signatures

  union all
  -- G) search_path seguro (public, pg_temp) nas 6 RPCs
  select
    'G) search_path seguro em ' || rpc_name,
    coalesce((
      select array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%'
      from pg_catalog.pg_proc p
      where p.oid = to_regprocedure('public.' || rpc_signature)
    ), false),
    'pg_proc.proconfig'
  from rpc_signatures

  union all
  -- H) ausência de EXECUTE pra public/anon/authenticated nas 6 RPCs
  select
    'H) sem EXECUTE pra "' || role_name || '" em ' || rpc_name,
    not has_function_privilege(role_name, to_regprocedure('public.' || rpc_signature), 'EXECUTE'),
    'has_function_privilege(' || role_name || ', EXECUTE)'
  from rpc_signatures
  cross join (values ('public'), ('anon'), ('authenticated')) as roles(role_name)

  union all
  -- I) EXECUTE concedido pra service_role nas 6 RPCs
  select
    'I) EXECUTE concedido pra service_role em ' || rpc_name,
    has_function_privilege('service_role', to_regprocedure('public.' || rpc_signature), 'EXECUTE'),
    'has_function_privilege(service_role, EXECUTE)'
  from rpc_signatures

  union all
  -- J) índices esperados
  select
    'J) índice ' || idx_name || ' existe',
    exists (
      select 1 from pg_catalog.pg_indexes
      where schemaname = 'public' and tablename = 'bookings' and indexname = idx_name
    ),
    'pg_indexes'
  from (values
    ('idx_bookings_public_code'),
    ('idx_bookings_idempotency_key'),
    ('idx_bookings_starts_at_status'),
    ('idx_bookings_status_expires'),
    ('idx_bookings_booking_date')
  ) as idxs(idx_name)

  union all
  -- K) colunas esperadas de public.bookings: nome, tipo e nulabilidade
  -- (metadado de schema -- nunca lê nenhuma linha de dado da tabela)
  select
    'K) coluna ' || expected.column_name || ' (' || expected.data_type || ', ' ||
      case when expected.not_null then 'not null' else 'nullable' end || ')',
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'bookings'
        and c.column_name = expected.column_name
        and c.data_type = expected.data_type
        and (c.is_nullable = 'NO') = expected.not_null
    ),
    'information_schema.columns'
  from (values
    ('id', 'uuid', true),
    ('public_code', 'text', true),
    ('idempotency_key', 'text', false),
    ('request_signature', 'text', false),
    ('mode', 'text', true),
    ('booking_date', 'date', true),
    ('booking_time', 'text', true),
    ('starts_at', 'timestamp with time zone', true),
    ('ends_at', 'timestamp with time zone', true),
    ('patient_name', 'text', true),
    ('patient_email', 'text', true),
    ('patient_phone', 'text', true),
    ('commercial_terms_accepted_at', 'timestamp with time zone', true),
    ('status', 'text', true),
    ('expires_at', 'timestamp with time zone', true),
    ('confirmed_at', 'timestamp with time zone', false),
    ('google_event_id', 'text', false),
    ('google_meet_url', 'text', false),
    ('created_at', 'timestamp with time zone', true),
    ('updated_at', 'timestamp with time zone', true)
  ) as expected(column_name, data_type, not_null)

  union all
  -- K) valores padrão esperados (metadado de schema -- não é dado)
  select
    'K) coluna ' || col_name || ' tem o valor padrão esperado',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'bookings'
        and column_name = col_name and column_default = expected_default
    ),
    'information_schema.columns.column_default'
  from (values
    ('id', 'gen_random_uuid()'),
    ('status', '''PENDING_PAYMENT''::text'),
    ('created_at', 'now()'),
    ('updated_at', 'now()')
  ) as defaults(col_name, expected_default)

  union all
  -- K) check constraint da coluna status contém os 6 estados esperados
  select
    'K) check constraint de status contém os 6 estados esperados',
    coalesce((
      select pg_get_constraintdef(con.oid) like '%PENDING_PAYMENT%'
        and pg_get_constraintdef(con.oid) like '%CONFIRMING%'
        and pg_get_constraintdef(con.oid) like '%CONFIRMED%'
        and pg_get_constraintdef(con.oid) like '%EXPIRED%'
        and pg_get_constraintdef(con.oid) like '%PAYMENT_REJECTED%'
        and pg_get_constraintdef(con.oid) like '%UNKNOWN%'
      from pg_catalog.pg_constraint con
      where con.conrelid = to_regclass('public.bookings')
        and con.contype = 'c'
        and pg_get_constraintdef(con.oid) like '%status%'
    ), false),
    'pg_constraint + pg_get_constraintdef'
)
select
  check_name,
  case when passed then 'PASS' else 'FAIL' end as result,
  detail
from checks
order by check_name;

-- =====================================================================
-- L) Definição da view public.active_bookings (texto de código -- não
-- é dado de reserva nenhuma)
-- =====================================================================
select pg_get_viewdef(to_regclass('public.active_bookings'), true) as active_bookings_definition;

-- =====================================================================
-- M) Definição completa das 6 RPCs (texto de código -- nunca consulta
-- nenhuma linha real de public.bookings)
-- =====================================================================
select
  rpc_name,
  pg_get_functiondef(to_regprocedure('public.' || rpc_signature)) as function_definition
from (
  values
    ('create_booking', 'create_booking(text,text,text,text,date,text,timestamptz,timestamptz,text,text,text,integer)'),
    ('begin_confirmation', 'begin_confirmation(uuid)'),
    ('finalize_confirmation', 'finalize_confirmation(uuid,text,text)'),
    ('revert_to_pending', 'revert_to_pending(uuid)'),
    ('mark_unknown', 'mark_unknown(uuid)'),
    ('reject_booking', 'reject_booking(uuid)')
) as rpcs(rpc_name, rpc_signature)
order by rpc_name;
