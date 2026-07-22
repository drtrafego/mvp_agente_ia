-- =====================================================================
-- 001_agentes_multi_empresa.sql
-- Banco: Neon do mvp_agente_ia (o mesmo de DATABASE_URL)
-- Origem: docs/PLANO-AGENTES-MULTI-EMPRESA.md, secoes 11.1, 11.2 e 11.3
--
-- STATUS: EXECUTADO em 21/07/2026 no Neon dos agentes, depois de corrigir
-- o bloco 4 com a introspecao real do banco. Resultado verificado:
--   3 organizations, 10 members, 3 agents, provision_agent_schema criada.
-- A funcao foi validada com um schema de teste descartavel: 17 colunas
-- identicas ao schema agente24horas, idempotente na segunda execucao, e
-- recusou nomes invalidos ('Public; drop table x', '1abc', 'public"',
-- nome com mais de 39 caracteres).
-- Reexecutar e seguro: tudo e idempotente (if not exists, on conflict).
--
-- ORDEM DE EXECUCAO (obrigatoria, de cima para baixo):
--   1. Bloco 0, extensao pgcrypto (gen_random_uuid).
--   2. Bloco 1, public.organizations.
--   3. Bloco 2, public.members (depende de organizations).
--   4. Bloco 3, public.agents (depende de organizations).
--   5. Bloco 4, public.provision_agent_schema.
--      ATENCAO: este bloco esta PROVISORIO. Ler o aviso dentro dele
--      antes de executar. Ele NAO deve ser executado antes da
--      introspecao real do Neon (secao 10.3 do plano).
--   6. Bloco 5, seed das 3 empresas.
--   7. Bloco 6, seed dos membros (depende do bloco 5).
--   8. Bloco 7, seed dos 3 agentes atuais (depende do bloco 5).
--   9. Bloco 8, verificacao pos seed (somente SELECT).
--
-- Os blocos 1 a 3 e 5 a 8 sao aditivos, idempotentes e nao alteram
-- nenhum objeto existente. Os schemas agente24horas, casaldotrafego e
-- drlucas e as tabelas de public.* nao sao tocados.
--
-- ROLLBACK dos blocos 1 a 3:
--   drop table public.agents;
--   drop table public.members;
--   drop table public.organizations;
--   drop function public.provision_agent_schema(text);
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensao necessaria para gen_random_uuid()
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. organizations: espelho da empresa do portal (sync por slug)
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. members: quem acessa a empresa, por email (minusculas)
-- ---------------------------------------------------------------------
create table if not exists public.members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email           text not null,
  role            text not null default 'member',
  created_at      timestamptz not null default now(),
  constraint members_email_lower_ck check (email = lower(email)),
  constraint members_role_ck        check (role in ('owner', 'member')),
  constraint members_org_email_uk   unique (organization_id, email)
);

create index if not exists members_email_idx on public.members (email);
create index if not exists members_org_idx   on public.members (organization_id);

-- ---------------------------------------------------------------------
-- 3. agents: o catalogo que sai do codigo. 1 empresa para N agentes.
--    slug e global (as tabelas public.* usam agent_slug sem org).
--    schema_name e imutavel e validado por CHECK. O CHECK e a barreira
--    que sustenta a allowlist de schema do app (secao 4.1 do plano).
-- ---------------------------------------------------------------------
create table if not exists public.agents (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  slug                 text not null unique,
  schema_name          text not null unique,
  name                 text not null,
  persona              text not null default '',
  description          text not null default '',
  accent               text not null default 'primary',
  meta_phone_number_id text,
  meta_waba_id         text,
  meta_token_env       text,
  meta_token_cipher    text,
  lead_source          text not null default 'none',
  lead_source_page_id  text,
  active               boolean not null default true,
  display_order        integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint agents_slug_ck   check (slug        ~ '^[a-z][a-z0-9_]{1,38}$'),
  constraint agents_schema_ck check (schema_name ~ '^[a-z][a-z0-9_]{1,38}$'),
  constraint agents_accent_ck check (accent in ('primary', 'secondary', 'accent')),
  constraint agents_source_ck check (lead_source in ('form', 'outreach', 'none')),
  constraint agents_source_page_ck
    check (lead_source <> 'form' or (lead_source_page_id is not null and lead_source_page_id <> '')),
  constraint agents_meta_pair_ck
    check ((meta_phone_number_id is null) = (meta_waba_id is null))
);

create index if not exists agents_org_idx on public.agents (organization_id, display_order);

-- ---------------------------------------------------------------------
-- BLOCO 4, VALIDADO POR INTROSPECAO REAL em 21/07/2026.
--
-- O DDL abaixo reproduz exatamente a estrutura viva dos schemas
-- agente24horas, casaldotrafego e drlucas, lida de
-- information_schema.columns, pg_constraint e pg_indexes. Os tres sao
-- identicos entre si. Diferencas em relacao ao rascunho anterior, que
-- vinha so da leitura de lib/queries.ts:
--   conversations.synced_at        existia no banco e faltava aqui
--   conversations.cost_usd         e numeric sem precisao, nao numeric(12,6)
--   messages.platform_message_id   existia no banco e faltava aqui
--   messages.session_id            e NULLABLE no banco, nao not null
-- As quatro divergencias quebrariam o sync do VPS em agente novo.
--
-- Os unicos indices existentes nos schemas atuais sao as chaves
-- primarias. Os tres indices criados no fim desta funcao sao ADICIONAIS
-- e deliberados: nao alteram escrita, so aceleram a leitura do painel.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 4. provision_agent_schema: cria o schema do agente com quoting seguro
--    (format %I) e DDL idempotente. Chamada pelo /admin do portal com o
--    nome bindado como parametro, nunca por concatenacao em TypeScript.
-- ---------------------------------------------------------------------
create or replace function public.provision_agent_schema(p_schema text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if p_schema is null or p_schema !~ '^[a-z][a-z0-9_]{1,38}$' then
    raise exception 'schema invalido: %', p_schema;
  end if;

  execute format('create schema if not exists %I', p_schema);

  execute format($ddl$
    create table if not exists %I.conversations (
      session_id    text primary key,
      chat_id       text,
      channel       text,
      title         text,
      started_at    timestamptz,
      ended_at      timestamptz,
      message_count integer,
      cost_usd      numeric,
      input_tokens  bigint,
      output_tokens bigint,
      synced_at     timestamptz default now()
    )
  $ddl$, p_schema);

  execute format($ddl$
    create table if not exists %I.messages (
      id                  text primary key,
      session_id          text,
      role                text,
      content             text,
      ts                  timestamptz,
      platform_message_id text
    )
  $ddl$, p_schema);

  execute format(
    'create index if not exists conversations_started_at_idx on %I.conversations (started_at desc)',
    p_schema);
  execute format(
    'create index if not exists conversations_chat_id_idx on %I.conversations (chat_id)',
    p_schema);
  execute format(
    'create index if not exists messages_session_ts_idx on %I.messages (session_id, ts)',
    p_schema);
end;
$fn$;

-- ##### FIM DO BLOCO PROVISORIO ######################################

-- ---------------------------------------------------------------------
-- 5. SEED: as 3 empresas confirmadas pelo dono (decisao D6)
--
--    EMPRESAS INTERNAS: 'agente24horas' e 'casal-do-trafego-admin' sao
--    empresas proprias do dono e ficam no guarda chuva dos superadmins.
--    Nao remover os owners dessas duas achando que e sujeira de seed.
--    'dr-lucas' e cliente externo.
-- ---------------------------------------------------------------------
insert into public.organizations (name, slug) values
  ('Agente24horas',            'agente24horas'),           -- interna
  ('Casal do Tráfego (Admin)', 'casal-do-trafego-admin'),  -- interna
  ('Dr. Lucas',                'dr-lucas')                 -- cliente
on conflict (slug) do update
  set name = excluded.name,
      updated_at = now();

-- ---------------------------------------------------------------------
-- 6. SEED: membros.
--
--    Regra do dono: os 3 superadmins do portal (lista canonica do
--    ADMIN_EMAILS) entram como OWNER nas 3 empresas. Sao eles:
--      dr.trafego@gmail.com
--      amandafelixgolden@gmail.com
--      amandaferreirafelixsilva@gmail.com
--    Alem deles ficam os membros vindos do portal_access_control:
--      agente24horas          owner amandafelixgolden@gmail.com
--      casal-do-trafego-admin owner dr.trafego@gmail.com
--                             allowed amandafelixgolden@gmail.com
--      dr-lucas               owner lucasfernandesba@gmail.com
--    Como os membros do portal dessas duas empresas internas ja sao
--    superadmins, a uniao das duas listas da o conjunto abaixo. Cada par
--    (org, email) aparece UMA vez e todos os emails estao em minusculas
--    (exigencia do CHECK members_email_lower_ck).
--
--    Lembrete de seguranca: superadmin ve TUDO por isSuperAdmin(email),
--    antes de qualquer consulta a members. Estas linhas sao conveniencia
--    de listagem, nao sao o que concede o acesso.
-- ---------------------------------------------------------------------
insert into public.members (organization_id, email, role)
select o.id, v.email, v.role
from (values
  -- empresa interna
  ('agente24horas',          'dr.trafego@gmail.com',               'owner'),
  ('agente24horas',          'amandafelixgolden@gmail.com',        'owner'),
  ('agente24horas',          'amandaferreirafelixsilva@gmail.com', 'owner'),

  -- empresa interna
  ('casal-do-trafego-admin', 'dr.trafego@gmail.com',               'owner'),
  ('casal-do-trafego-admin', 'amandafelixgolden@gmail.com',        'owner'),
  ('casal-do-trafego-admin', 'amandaferreirafelixsilva@gmail.com', 'owner'),

  -- cliente externo: owner do portal + os 3 superadmins
  ('dr-lucas',               'lucasfernandesba@gmail.com',         'owner'),
  ('dr-lucas',               'dr.trafego@gmail.com',               'owner'),
  ('dr-lucas',               'amandafelixgolden@gmail.com',        'owner'),
  ('dr-lucas',               'amandaferreirafelixsilva@gmail.com', 'owner')
) as v(org_slug, email, role)
join public.organizations o on o.slug = v.org_slug
on conflict (organization_id, email) do update
  set role = excluded.role;

-- ---------------------------------------------------------------------
-- 7. SEED: os 3 agentes atuais, com os mesmos valores que estavam
--    hardcode em lib/agents.ts e lib/meta-config.ts.
--    do nothing: uma reexecucao nunca sobrescreve edicao feita no admin.
-- ---------------------------------------------------------------------
insert into public.agents (
  organization_id, slug, schema_name, name, persona, description, accent,
  meta_phone_number_id, meta_waba_id, meta_token_env,
  lead_source, lead_source_page_id, active, display_order
)
select o.id, v.slug, v.schema_name, v.name, v.persona, v.description, v.accent,
       v.phone_id, v.waba_id, v.token_env,
       v.lead_source, v.page_id, true, v.display_order
from (values
  ('agente24horas', 'agente24horas', 'agente24horas', 'Agente24Horas', 'Nina',
   'Atendimento 24h no WhatsApp', 'secondary',
   '115216611574100', '106071169159774', 'META_ACCESS_TOKEN',
   'form', '109902140539351', 0),

  ('casal-do-trafego-admin', 'casaldotrafego', 'casaldotrafego', 'Casal do Tráfego', 'Amanda',
   'SAC e qualificação de leads de tráfego pago', 'accent',
   '414594695067374', '404364559427067', 'META_ACCESS_TOKEN',
   'outreach', null, 0),

  ('dr-lucas', 'drlucas', 'drlucas', 'Dr. Lucas', 'Assistente',
   'Atendimento clínico e agendamentos', 'primary',
   '1238137526046869', '1014360307867907', 'META_ACCESS_TOKEN_DRLUCAS',
   'none', null, 0)
) as v(org_slug, slug, schema_name, name, persona, description, accent,
       phone_id, waba_id, token_env, lead_source, page_id, display_order)
join public.organizations o on o.slug = v.org_slug
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 8. Verificacao pos seed (somente leitura). Esperado: 3 organizacoes,
--    10 membros, 3 agentes com schema_existe = 1.
-- ---------------------------------------------------------------------
select slug, name from public.organizations order by slug;

select o.slug as org, m.email, m.role
from public.members m
join public.organizations o on o.id = m.organization_id
order by o.slug, m.role desc, m.email;

select o.slug as org, a.slug as agente, a.schema_name, a.lead_source,
       a.meta_phone_number_id, a.meta_token_env, a.active
from public.agents a
join public.organizations o on o.id = a.organization_id
order by o.slug, a.display_order;

-- Confere que todo schema_name cadastrado existe de fato no banco
select a.slug, a.schema_name,
       (select count(*) from information_schema.schemata s
         where s.schema_name = a.schema_name) as schema_existe
from public.agents a;
