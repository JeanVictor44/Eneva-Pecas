-- Extensão para gen_random_uuid (normalmente já habilitada no Supabase)
create extension if not exists pgcrypto;

-- Tabela de peças
create table if not exists public.pecas (
  id          uuid primary key default gen_random_uuid(),
  sku         text not null unique,
  part_number text not null,
  descricao   text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid()
);

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
alter table public.pecas enable row level security;
alter table public.pecas_anexos enable row level security;

create policy "pecas_select_auth" on public.pecas for select to authenticated using (true);
create policy "pecas_insert_auth" on public.pecas for insert to authenticated with check (true);
create policy "pecas_update_auth" on public.pecas for update to authenticated using (true) with check (true);
create policy "pecas_delete_auth" on public.pecas for delete to authenticated using (true);

create policy "anexos_select_auth" on public.pecas_anexos for select to authenticated using (true);
create policy "anexos_insert_auth" on public.pecas_anexos for insert to authenticated with check (true);
create policy "anexos_update_auth" on public.pecas_anexos for update to authenticated using (true) with check (true);
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
create policy "fotos_insert_auth" on storage.objects for insert to authenticated with check (bucket_id = 'pecas-fotos');
create policy "fotos_update_auth" on storage.objects for update to authenticated using (bucket_id = 'pecas-fotos');
create policy "fotos_delete_auth" on storage.objects for delete to authenticated using (bucket_id = 'pecas-fotos');

-- Documentos: privado — todas as operações só para autenticados (inclui select p/ URL assinada)
create policy "docs_select_auth" on storage.objects for select to authenticated using (bucket_id = 'pecas-documentos');
create policy "docs_insert_auth" on storage.objects for insert to authenticated with check (bucket_id = 'pecas-documentos');
create policy "docs_update_auth" on storage.objects for update to authenticated using (bucket_id = 'pecas-documentos');
create policy "docs_delete_auth" on storage.objects for delete to authenticated using (bucket_id = 'pecas-documentos');
