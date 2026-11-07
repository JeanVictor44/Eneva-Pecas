-- Extensão para gen_random_uuid (normalmente já habilitada no Supabase)
create extension if not exists pgcrypto;

-- Tabela de categorias (1 por peça, opcional)
create table if not exists public.categorias (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

-- Unicidade case-insensitive do nome
create unique index if not exists categorias_nome_lower_idx
  on public.categorias (lower(nome));

-- Tabela de peças
create table if not exists public.pecas (
  id          uuid primary key default gen_random_uuid(),
  descricao   text not null,
  categoria_id uuid references public.categorias(id) on delete set null,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid()
);

-- Tabela de referências / trincas (N por peça): fabricante + SKU + part number
create table if not exists public.pecas_referencias (
  id          uuid primary key default gen_random_uuid(),
  peca_id     uuid not null references public.pecas(id) on delete cascade,
  sku         text not null unique,
  part_number text not null,
  fabricante  text not null,
  ordem       smallint not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid()
);

create index if not exists pecas_referencias_peca_id_idx on public.pecas_referencias(peca_id);

-- Tabela de anexos (N por peça)
create table if not exists public.pecas_anexos (
  id         uuid primary key default gen_random_uuid(),
  peca_id    uuid not null references public.pecas(id) on delete cascade,
  tipo       text not null check (tipo in ('foto','documento')),
  path       text not null,
  nome       text,
  mime_type  text,
  tamanho    bigint,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create index if not exists pecas_anexos_peca_id_idx on public.pecas_anexos(peca_id);

-- RLS
alter table public.categorias enable row level security;
alter table public.pecas enable row level security;
alter table public.pecas_referencias enable row level security;
alter table public.pecas_anexos enable row level security;

drop policy if exists "categorias_select_auth" on public.categorias;
create policy "categorias_select_auth" on public.categorias for select to authenticated using (true);
drop policy if exists "categorias_insert_auth" on public.categorias;
create policy "categorias_insert_auth" on public.categorias for insert to authenticated with check (true);
drop policy if exists "categorias_update_auth" on public.categorias;
create policy "categorias_update_auth" on public.categorias for update to authenticated using (true) with check (true);
drop policy if exists "categorias_delete_auth" on public.categorias;
create policy "categorias_delete_auth" on public.categorias for delete to authenticated using (true);

drop policy if exists "pecas_select_auth" on public.pecas;
create policy "pecas_select_auth" on public.pecas for select to authenticated using (true);
drop policy if exists "pecas_insert_auth" on public.pecas;
create policy "pecas_insert_auth" on public.pecas for insert to authenticated with check (true);
drop policy if exists "pecas_update_auth" on public.pecas;
create policy "pecas_update_auth" on public.pecas for update to authenticated using (true) with check (true);
drop policy if exists "pecas_delete_auth" on public.pecas;
create policy "pecas_delete_auth" on public.pecas for delete to authenticated using (true);

drop policy if exists "referencias_select_auth" on public.pecas_referencias;
create policy "referencias_select_auth" on public.pecas_referencias for select to authenticated using (true);
drop policy if exists "referencias_insert_auth" on public.pecas_referencias;
create policy "referencias_insert_auth" on public.pecas_referencias for insert to authenticated with check (true);
drop policy if exists "referencias_update_auth" on public.pecas_referencias;
create policy "referencias_update_auth" on public.pecas_referencias for update to authenticated using (true) with check (true);
drop policy if exists "referencias_delete_auth" on public.pecas_referencias;
create policy "referencias_delete_auth" on public.pecas_referencias for delete to authenticated using (true);

drop policy if exists "anexos_select_auth" on public.pecas_anexos;
create policy "anexos_select_auth" on public.pecas_anexos for select to authenticated using (true);
drop policy if exists "anexos_insert_auth" on public.pecas_anexos;
create policy "anexos_insert_auth" on public.pecas_anexos for insert to authenticated with check (true);
drop policy if exists "anexos_update_auth" on public.pecas_anexos;
create policy "anexos_update_auth" on public.pecas_anexos for update to authenticated using (true) with check (true);
drop policy if exists "anexos_delete_auth" on public.pecas_anexos;
create policy "anexos_delete_auth" on public.pecas_anexos for delete to authenticated using (true);

-- Buckets
insert into storage.buckets (id, name, public)
values ('pecas-fotos', 'pecas-fotos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('pecas-documentos', 'pecas-documentos', false)
on conflict (id) do nothing;

-- Policies de Storage
-- Fotos: leitura pública já é garantida pelo bucket público; upload/edição/remoção só autenticados
drop policy if exists "fotos_insert_auth" on storage.objects;
create policy "fotos_insert_auth" on storage.objects for insert to authenticated with check (bucket_id = 'pecas-fotos');
drop policy if exists "fotos_update_auth" on storage.objects;
create policy "fotos_update_auth" on storage.objects for update to authenticated using (bucket_id = 'pecas-fotos');
drop policy if exists "fotos_delete_auth" on storage.objects;
create policy "fotos_delete_auth" on storage.objects for delete to authenticated using (bucket_id = 'pecas-fotos');

-- Documentos: privado — todas as operações só para autenticados (inclui select p/ URL assinada)
drop policy if exists "docs_select_auth" on storage.objects;
create policy "docs_select_auth" on storage.objects for select to authenticated using (bucket_id = 'pecas-documentos');
drop policy if exists "docs_insert_auth" on storage.objects;
create policy "docs_insert_auth" on storage.objects for insert to authenticated with check (bucket_id = 'pecas-documentos');
drop policy if exists "docs_update_auth" on storage.objects;
create policy "docs_update_auth" on storage.objects for update to authenticated using (bucket_id = 'pecas-documentos');
drop policy if exists "docs_delete_auth" on storage.objects;
create policy "docs_delete_auth" on storage.objects for delete to authenticated using (bucket_id = 'pecas-documentos');

-- ============================================================
-- MIGRAÇÃO (aplicar UMA vez em bancos que já tinham sku/part_number em pecas).
-- Pré-requisito: a tabela pecas_referencias acima já foi criada.
-- ============================================================
-- Guardado para ser seguro tanto em banco NOVO (as colunas não existem: no-op)
-- quanto em banco EXISTENTE (migra os dados e remove as colunas).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pecas' and column_name = 'sku'
  ) then
    -- 1) Move os dados atuais para a primeira trinca de cada peça.
    insert into public.pecas_referencias (peca_id, sku, part_number, fabricante, ordem)
    select id, sku, part_number, 'Não informado', 0
    from public.pecas
    where not exists (
      select 1 from public.pecas_referencias r where r.peca_id = pecas.id
    );

    -- 2) Remove as colunas antigas de pecas.
    alter table public.pecas drop column if exists sku;
    alter table public.pecas drop column if exists part_number;
  end if;
end $$;

-- ============================================================
-- MIGRAÇÃO — Categorias (idempotente; seguro rodar sozinho num banco existente).
-- ============================================================
create table if not exists public.categorias (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create unique index if not exists categorias_nome_lower_idx
  on public.categorias (lower(nome));

alter table public.categorias enable row level security;

drop policy if exists "categorias_select_auth" on public.categorias;
create policy "categorias_select_auth" on public.categorias for select to authenticated using (true);
drop policy if exists "categorias_insert_auth" on public.categorias;
create policy "categorias_insert_auth" on public.categorias for insert to authenticated with check (true);
drop policy if exists "categorias_update_auth" on public.categorias;
create policy "categorias_update_auth" on public.categorias for update to authenticated using (true) with check (true);
drop policy if exists "categorias_delete_auth" on public.categorias;
create policy "categorias_delete_auth" on public.categorias for delete to authenticated using (true);

alter table public.pecas
  add column if not exists categoria_id uuid references public.categorias(id) on delete set null;

-- ============================================================
-- MIGRAÇÃO — Perfis e permissões (idempotente; seguro rodar de novo).
-- ============================================================

create table if not exists public.perfis (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  nome                text,
  ativo               boolean not null default true,
  pode_visualizar     boolean not null default true,
  pode_criar          boolean not null default false,
  pode_editar         boolean not null default false,
  pode_excluir        boolean not null default false,
  pode_gerir_usuarios boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.perfis enable row level security;

-- Função consultada por todas as policies.
-- O "security definer" é obrigatório, não estilístico: a policy da própria tabela
-- perfis chama pode(), que lê perfis. Rodando como dono da tabela, a função ignora
-- RLS e a recursão infinita não acontece. Pelo mesmo motivo, NUNCA aplicar
-- "force row level security" em public.perfis.
-- O search_path fixo fecha o sequestro de resolução de nomes, clássico em
-- funções security definer.
create or replace function public.pode(acao text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.ativo and case acao
      when 'visualizar'     then p.pode_visualizar
      when 'criar'          then p.pode_criar
      when 'editar'         then p.pode_editar
      when 'excluir'        then p.pode_excluir
      when 'gerir_usuarios' then p.pode_gerir_usuarios
      else false
    end
    from public.perfis p
    where p.user_id = auth.uid()
  ), false);
$$;

revoke all on function public.pode(text) from public;
grant execute on function public.pode(text) to authenticated;

-- Backfill: todo usuário que já existe vira administrador completo.
-- Decisão do spec: base pequena, ajuste fino pela tela depois. Ninguém fica
-- trancado para fora.
insert into public.perfis (
  user_id, ativo,
  pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_gerir_usuarios
)
select u.id, true, true, true, true, true, true
from auth.users u
on conflict (user_id) do nothing;

-- Policies de perfis: cada um lê o próprio; gestor lê e escreve todos.
drop policy if exists "perfis_select" on public.perfis;
create policy "perfis_select" on public.perfis for select to authenticated
  using (user_id = auth.uid() or public.pode('gerir_usuarios'));

drop policy if exists "perfis_insert" on public.perfis;
create policy "perfis_insert" on public.perfis for insert to authenticated
  with check (public.pode('gerir_usuarios'));

-- No update a condição vai em using E em with check: só "using" permitiria editar
-- uma linha e deixá-la num estado que a policy rejeitaria.
drop policy if exists "perfis_update" on public.perfis;
create policy "perfis_update" on public.perfis for update to authenticated
  using (public.pode('gerir_usuarios'))
  with check (public.pode('gerir_usuarios'));

drop policy if exists "perfis_delete" on public.perfis;
create policy "perfis_delete" on public.perfis for delete to authenticated
  using (public.pode('gerir_usuarios'));

-- Invariante: nunca pode faltar um gestor ativo. Uma checagem no app não resolve —
-- dois gestores se rebaixando ao mesmo tempo passam os dois pela verificação e
-- deixam o sistema sem ninguém.
-- O lock consultivo é o que fecha essa corrida: sob READ COMMITTED, sem ele, as
-- duas transações rodariam a checagem antes de qualquer commit e cada uma ainda
-- enxergaria o gestor que a outra está removendo. Com o lock, a segunda espera até
-- o commit da primeira e então lê o estado já atualizado.
create or replace function public.garantir_gestor_ativo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('perfis_gestor_ativo'));

  if not exists (
    select 1 from public.perfis where ativo and pode_gerir_usuarios
  ) then
    raise exception 'Precisa existir pelo menos um usuário ativo com permissão de gerir usuários.';
  end if;
  return null;
end;
$$;

drop trigger if exists perfis_garantir_gestor_ativo on public.perfis;
create constraint trigger perfis_garantir_gestor_ativo
  after update or delete on public.perfis
  deferrable initially deferred
  for each row
  execute function public.garantir_gestor_ativo();

-- ------------------------------------------------------------
-- Substitui as policies "todo autenticado faz tudo" das tabelas de peças.
-- ------------------------------------------------------------

drop policy if exists "pecas_select_auth" on public.pecas;
create policy "pecas_select_auth" on public.pecas for select to authenticated
  using (public.pode('visualizar'));
drop policy if exists "pecas_insert_auth" on public.pecas;
create policy "pecas_insert_auth" on public.pecas for insert to authenticated
  with check (public.pode('criar'));
drop policy if exists "pecas_update_auth" on public.pecas;
create policy "pecas_update_auth" on public.pecas for update to authenticated
  using (public.pode('editar')) with check (public.pode('editar'));
drop policy if exists "pecas_delete_auth" on public.pecas;
create policy "pecas_delete_auth" on public.pecas for delete to authenticated
  using (public.pode('excluir'));

drop policy if exists "referencias_select_auth" on public.pecas_referencias;
create policy "referencias_select_auth" on public.pecas_referencias for select to authenticated
  using (public.pode('visualizar'));
drop policy if exists "referencias_insert_auth" on public.pecas_referencias;
create policy "referencias_insert_auth" on public.pecas_referencias for insert to authenticated
  with check (public.pode('criar') or public.pode('editar'));
drop policy if exists "referencias_update_auth" on public.pecas_referencias;
create policy "referencias_update_auth" on public.pecas_referencias for update to authenticated
  using (public.pode('editar')) with check (public.pode('editar'));
drop policy if exists "referencias_delete_auth" on public.pecas_referencias;
create policy "referencias_delete_auth" on public.pecas_referencias for delete to authenticated
  using (public.pode('editar') or public.pode('excluir'));

drop policy if exists "anexos_select_auth" on public.pecas_anexos;
create policy "anexos_select_auth" on public.pecas_anexos for select to authenticated
  using (public.pode('visualizar'));
drop policy if exists "anexos_insert_auth" on public.pecas_anexos;
create policy "anexos_insert_auth" on public.pecas_anexos for insert to authenticated
  with check (public.pode('criar') or public.pode('editar'));
drop policy if exists "anexos_update_auth" on public.pecas_anexos;
create policy "anexos_update_auth" on public.pecas_anexos for update to authenticated
  using (public.pode('editar')) with check (public.pode('editar'));
drop policy if exists "anexos_delete_auth" on public.pecas_anexos;
create policy "anexos_delete_auth" on public.pecas_anexos for delete to authenticated
  using (public.pode('editar') or public.pode('excluir'));

-- Categorias: o insert aceita 'criar' OU 'editar' porque resolverCategoria() cria
-- categoria nova tanto no cadastro quanto na edição de peça.
drop policy if exists "categorias_select_auth" on public.categorias;
create policy "categorias_select_auth" on public.categorias for select to authenticated
  using (public.pode('visualizar'));
drop policy if exists "categorias_insert_auth" on public.categorias;
create policy "categorias_insert_auth" on public.categorias for insert to authenticated
  with check (public.pode('criar') or public.pode('editar'));
drop policy if exists "categorias_update_auth" on public.categorias;
create policy "categorias_update_auth" on public.categorias for update to authenticated
  using (public.pode('editar')) with check (public.pode('editar'));
drop policy if exists "categorias_delete_auth" on public.categorias;
create policy "categorias_delete_auth" on public.categorias for delete to authenticated
  using (public.pode('editar'));

-- ------------------------------------------------------------
-- Storage. O bucket pecas-fotos é público (leitura sem policy); pecas-documentos é
-- privado e o select cobre a URL assinada.
-- Remover uma foto é edição; apagar a peça leva os arquivos junto — daí o
-- "editar OR excluir" no delete.
-- O update leva "with check" além de "using": sem ele, um usuário com 'editar'
-- poderia trocar o bucket_id de uma linha de pecas-documentos (privado) para
-- pecas-fotos (público) e vazar o arquivo.
-- ------------------------------------------------------------

drop policy if exists "fotos_insert_auth" on storage.objects;
create policy "fotos_insert_auth" on storage.objects for insert to authenticated
  with check (bucket_id = 'pecas-fotos' and (public.pode('criar') or public.pode('editar')));
drop policy if exists "fotos_update_auth" on storage.objects;
create policy "fotos_update_auth" on storage.objects for update to authenticated
  using (bucket_id = 'pecas-fotos' and public.pode('editar'))
  with check (bucket_id = 'pecas-fotos' and public.pode('editar'));
drop policy if exists "fotos_delete_auth" on storage.objects;
create policy "fotos_delete_auth" on storage.objects for delete to authenticated
  using (bucket_id = 'pecas-fotos' and (public.pode('editar') or public.pode('excluir')));

drop policy if exists "docs_select_auth" on storage.objects;
create policy "docs_select_auth" on storage.objects for select to authenticated
  using (bucket_id = 'pecas-documentos' and public.pode('visualizar'));
drop policy if exists "docs_insert_auth" on storage.objects;
create policy "docs_insert_auth" on storage.objects for insert to authenticated
  with check (bucket_id = 'pecas-documentos' and (public.pode('criar') or public.pode('editar')));
drop policy if exists "docs_update_auth" on storage.objects;
create policy "docs_update_auth" on storage.objects for update to authenticated
  using (bucket_id = 'pecas-documentos' and public.pode('editar'))
  with check (bucket_id = 'pecas-documentos' and public.pode('editar'));
drop policy if exists "docs_delete_auth" on storage.objects;
create policy "docs_delete_auth" on storage.objects for delete to authenticated
  using (bucket_id = 'pecas-documentos' and (public.pode('editar') or public.pode('excluir')));

-- ============================================================
-- MIGRAÇÃO — Código de posição e Local (idempotente; seguro rodar de novo).
-- Ambos opcionais: texto livre, null quando não informado.
-- ============================================================
alter table public.pecas add column if not exists codigo_posicao text;
alter table public.pecas add column if not exists local text;
