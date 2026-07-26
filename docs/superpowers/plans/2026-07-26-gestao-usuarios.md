# Gestão de Usuários e Permissões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um administrador crie logins e defina, por usuário, quais das cinco permissões (visualizar, criar, editar, excluir, gerir usuários) ele tem — com a regra valendo tanto na interface quanto no banco.

**Architecture:** Uma tabela `public.perfis` (uma linha por usuário) é a fonte única de verdade. As policies de RLS consultam essa tabela pela função `public.pode(acao text)`, marcada `security definer` para não entrar em recursão. No app, `lib/perfil.ts` lê o perfil do usuário logado e as Server Actions o consultam antes de agir; a UI esconde o que a pessoa não pode fazer. Criar login e redefinir senha usam a Admin API do Supabase, isolada em `lib/supabase/admin.ts`.

**Tech Stack:** Next.js 16.2.10 (App Router, Server Actions), React 19.2.4, Supabase (`@supabase/ssr` + `@supabase/supabase-js`), `@base-ui/react` com padrão shadcn, Tailwind 4, sonner, lucide-react.

## Global Constraints

- **Não commitar.** O usuário pediu explicitamente que nada seja commitado. Onde o fluxo normal pediria `git commit`, o plano usa um passo de verificação. Ao final, os arquivos ficam no working tree para o usuário revisar.
- **Este não é o Next.js do seu treinamento** (AGENTS.md). Antes de escrever código de framework, consulte o guia correspondente em `node_modules/next/dist/docs/01-app/`. Os relevantes aqui são `02-guides/server-actions.md`, `02-guides/authentication.md` e `03-api-reference/04-functions/redirect.md`.
- **O projeto não tem testes automatizados** — não existe runner nem script `test` no `package.json`. A verificação de cada task é `npm run lint`, `npm run build` e checagens manuais com resultado esperado declarado. Não invente um framework de teste; não escreva arquivos `*.test.ts`.
- **Idioma:** todo código, comentário, mensagem de erro e texto de interface em português do Brasil, seguindo o que já existe no projeto.
- **Aspas simples e sem ponto e vírgula** em `app/` e `lib/`; os arquivos em `components/ui/` seguem o padrão do shadcn (aspas duplas). Siga o arquivo vizinho, não uma preferência própria.
- **As cinco permissões**, com estes nomes exatos: `visualizar`, `criar`, `editar`, `excluir`, `gerir_usuarios`. As colunas correspondentes são `pode_visualizar`, `pode_criar`, `pode_editar`, `pode_excluir`, `pode_gerir_usuarios`.
- **Senha mínima:** 8 caracteres.
- **A service role key ignora RLS.** Toda função que instancia o cliente admin checa `gerir_usuarios` antes — sem exceção, mesmo quando o layout da rota já protege.

---

### Task 1: Migração SQL — tabela `perfis`, função `pode()` e policies

Esta task é só banco. O catálogo continua funcionando durante e depois dela: o backfill dá as cinco permissões a todos os usuários atuais, então ninguém perde acesso no meio do caminho.

**Files:**
- Modify: `docs/supabase/setup.sql` (acrescentar no final; o arquivo é idempotente por construção)

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: tabela `public.perfis` com colunas `user_id, nome, ativo, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_gerir_usuarios, created_at, updated_at`; função `public.pode(acao text) returns boolean`

- [ ] **Step 1: Acrescentar o bloco de migração ao final de `docs/supabase/setup.sql`**

```sql
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
```

- [ ] **Step 2: Rodar o bloco no SQL Editor do Supabase**

Abra o projeto no painel do Supabase → SQL Editor → cole **apenas o bloco novo** (a partir de `-- MIGRAÇÃO — Perfis e permissões`) → Run.

Esperado: `Success. No rows returned.`

- [ ] **Step 3: Conferir que a tabela foi criada e o backfill rodou**

Rode no SQL Editor:

```sql
select
  (select count(*) from auth.users)                                     as usuarios,
  (select count(*) from public.perfis)                                  as perfis,
  (select count(*) from public.perfis where pode_gerir_usuarios and ativo) as gestores;
```

Esperado: as três colunas com o mesmo número, igual à quantidade de logins que você já tem. Se `gestores` for 0, **pare** — o backfill não rodou e você vai se trancar para fora.

- [ ] **Step 4: Conferir que a função está `security definer`**

```sql
select proname, prosecdef, proconfig
from pg_proc
where proname = 'pode' and pronamespace = 'public'::regnamespace;
```

Esperado: uma linha com `prosecdef = true` e `proconfig = {search_path=public}`. Se `prosecdef` vier `false`, a policy de `perfis` vai entrar em recursão infinita — recrie a função.

- [ ] **Step 5: Conferir que as policies antigas sumiram**

```sql
select tablename, policyname, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('pecas','pecas_referencias','pecas_anexos','categorias','perfis')
order by tablename, policyname;
```

Esperado: nenhuma linha com `qual = true`. Toda `qual`/`with_check` deve mencionar `pode(`. Se sobrou alguma `true`, a permissão correspondente não está valendo.

- [ ] **Step 6: Conferir que o app continua funcionando**

Rode `npm run dev` e abra `/pecas` com o seu login atual. Esperado: a lista aparece normalmente (você recebeu as cinco permissões no backfill). Se aparecer vazia, o `select` está sendo barrado — confira o Step 3.

- [ ] **Step 7: Tornar idempotente o bloco de policies original (correção da revisão final)**

O bloco original do arquivo (linhas ~60–99, anterior a esta migração — `categorias_*_auth`, `pecas_*_auth`, `referencias_*_auth`, `anexos_*_auth`, `fotos_*_auth`, `docs_*_auth`) usava `create policy` sem `drop policy if exists` antes. Postgres não tem `CREATE POLICY IF NOT EXISTS`: colar o arquivo inteiro num banco que já rodou este script abortava na primeira dessas policies com `42710: policy already exists` e, como o SQL Editor do Supabase roda em transação, nada do bloco de perfis abaixo era aplicado.

Acrescente `drop policy if exists "<nome>" on <tabela>;` imediatamente antes de cada `create policy` desse trecho antigo, no mesmo estilo que o bloco novo já usa (Steps 1–6 acima). Não altere as condições dessas policies antigas — elas continuam sendo substituídas mais adiante pelo bloco novo. O objetivo é só tornar o arquivo inteiro seguro de re-executar do zero. Exemplo do padrão aplicado:

```sql
drop policy if exists "categorias_select_auth" on public.categorias;
create policy "categorias_select_auth" on public.categorias for select to authenticated using (true);
```

Verificação: `grep -c "drop policy if exists" docs/supabase/setup.sql` deve aumentar (23 novas ocorrências: 4 em categorias, 4 em pecas, 4 em referencias, 4 em anexos, 3 em fotos, 4 em docs).

---

### Task 2: Camada de permissões no app (`lib/`)

**Files:**
- Create: `lib/permissoes.ts`
- Create: `lib/perfil.ts`
- Create: `lib/supabase/admin.ts`
- Modify: `lib/erros.ts`
- Modify: `.env.local.example`
- Modify: `.env.local` e `.env` (a chave real — passo manual do usuário)

**Interfaces:**
- Consumes: tabela `perfis` e função `pode()` da Task 1
- Produces:
  - `lib/permissoes.ts`: `PERMISSOES`, `type Permissao`, `type Permissoes`, `ROTULOS`, `SEM_PERMISSOES`, `COLUNAS_PERFIL`, `type LinhaPerfil`, `permissoesDaLinha(linha: LinhaPerfil): Permissoes`, `colunasDePermissoes(p: Permissoes)`
  - `lib/perfil.ts`: `type PerfilAtual`, `perfilAtual(): Promise<PerfilAtual | null>`, `exigir(p: Permissao): Promise<string | null>`
  - `lib/supabase/admin.ts`: `createAdminClient(): SupabaseClient`

- [ ] **Step 1: Criar `lib/permissoes.ts`**

Este arquivo é **puro de propósito**: nenhum import de servidor. Componentes client importam `ROTULOS` e `PERMISSOES` para desenhar os checkboxes; se `next/headers` entrasse aqui pela porta dos fundos, o build do bundle quebraria.

```ts
// Vocabulário de permissões. Sem imports de servidor — este módulo é importado
// tanto por Server Actions quanto por componentes client.

export const PERMISSOES = [
  'visualizar',
  'criar',
  'editar',
  'excluir',
  'gerir_usuarios',
] as const

export type Permissao = (typeof PERMISSOES)[number]

export type Permissoes = Record<Permissao, boolean>

export const ROTULOS: Record<Permissao, string> = {
  visualizar: 'Visualizar peças',
  criar: 'Criar peças',
  editar: 'Editar peças',
  excluir: 'Excluir peças',
  gerir_usuarios: 'Gerir usuários',
}

export const SEM_PERMISSOES: Permissoes = {
  visualizar: false,
  criar: false,
  editar: false,
  excluir: false,
  gerir_usuarios: false,
}

export const COLUNAS_PERFIL =
  'user_id, nome, ativo, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_gerir_usuarios'

export type LinhaPerfil = {
  user_id: string
  nome: string | null
  ativo: boolean
  pode_visualizar: boolean
  pode_criar: boolean
  pode_editar: boolean
  pode_excluir: boolean
  pode_gerir_usuarios: boolean
}

export function permissoesDaLinha(linha: LinhaPerfil): Permissoes {
  return {
    visualizar: linha.pode_visualizar,
    criar: linha.pode_criar,
    editar: linha.pode_editar,
    excluir: linha.pode_excluir,
    gerir_usuarios: linha.pode_gerir_usuarios,
  }
}

export function colunasDePermissoes(p: Permissoes) {
  return {
    pode_visualizar: p.visualizar,
    pode_criar: p.criar,
    pode_editar: p.editar,
    pode_excluir: p.excluir,
    pode_gerir_usuarios: p.gerir_usuarios,
  }
}
```

- [ ] **Step 2: Criar `lib/perfil.ts`**

```ts
import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  COLUNAS_PERFIL,
  SEM_PERMISSOES,
  permissoesDaLinha,
  type LinhaPerfil,
  type Permissao,
  type Permissoes,
} from '@/lib/permissoes'

export type PerfilAtual = {
  userId: string
  email: string
  nome: string | null
  ativo: boolean
  permissoes: Permissoes
}

const ACOES: Record<Permissao, string> = {
  visualizar: 'visualizar peças',
  criar: 'cadastrar peças',
  editar: 'editar peças',
  excluir: 'excluir peças',
  gerir_usuarios: 'gerir usuários',
}

// cache() do React deduplica por requisição: exigir() + perfilAtual() na mesma
// Server Action fazem uma leitura só, e as duas não podem discordar entre si.
export const perfilAtual = cache(async (): Promise<PerfilAtual | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('perfis')
    .select(COLUNAS_PERFIL)
    .eq('user_id', user.id)
    .maybeSingle<LinhaPerfil>()

  const email = user.email ?? ''

  // Login sem linha em perfis (ex.: criado direto no painel do Supabase) não tem
  // permissão nenhuma. O RLS já pensa assim; aqui o app concorda com ele.
  if (!data) {
    return { userId: user.id, email, nome: null, ativo: false, permissoes: SEM_PERMISSOES }
  }

  return {
    userId: user.id,
    email,
    nome: data.nome,
    ativo: data.ativo,
    permissoes: data.ativo ? permissoesDaLinha(data) : SEM_PERMISSOES,
  }
})

// Devolve a mensagem de erro quando falta a permissão, ou null quando está liberado.
export async function exigir(permissao: Permissao): Promise<string | null> {
  const perfil = await perfilAtual()
  if (!perfil) return 'Sessão expirada. Entre novamente.'
  if (!perfil.ativo) return 'Seu acesso está desativado. Fale com um administrador.'
  if (!perfil.permissoes[permissao]) {
    return `Você não tem permissão para ${ACOES[permissao]}.`
  }
  return null
}
```

- [ ] **Step 3: Criar `lib/supabase/admin.ts`**

```ts
// 'server-only' faz o build falhar se um componente client importar este módulo —
// erro de build em vez de erro de runtime. Não colocar em lib/permissoes.ts, que é
// importado por componentes client de propósito.
import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Cliente com a service role key: IGNORA RLS por completo.
// Só use depois de checar 'gerir_usuarios' com exigir() ou perfilAtual().
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() não pode ser usado no browser.')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.',
    )
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

- [ ] **Step 4: Tratar o erro de RLS em `lib/erros.ts`**

Substitua o corpo da função por:

```ts
export function mapErro(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Erro desconhecido.'
  // 42501 = insufficient_privilege: o RLS barrou a operação.
  if (error.code === '42501' || /row-level security/i.test(error.message ?? '')) {
    return 'Você não tem permissão para esta ação.'
  }
  // 23505 = unique_violation (Postgres)
  if (error.code === '23505' || /duplicate key/i.test(error.message ?? '')) {
    return 'SKU já cadastrado.'
  }
  return error.message ?? 'Ocorreu um erro.'
}
```

- [ ] **Step 5: Documentar a variável nova em `.env.local.example`**

Acrescente a linha:

```
SUPABASE_SERVICE_ROLE_KEY=
```

Sem prefixo `NEXT_PUBLIC_`, de propósito: essa chave nunca pode chegar ao browser.

- [ ] **Step 6: Pedir a chave ao usuário e colocá-la em `.env.local` e `.env`**

A chave está no painel do Supabase em **Settings → API → service_role**. Acrescente em `.env.local` **e** em `.env` (o projeto tem os dois, com o mesmo conteúdo):

```
SUPABASE_SERVICE_ROLE_KEY=<a chave copiada do painel>
```

Os dois arquivos já estão no `.gitignore` (`.env` e `.env*.local`).

- [ ] **Step 7: Verificar**

```bash
npm run lint
npx tsc --noEmit
```

Esperado: ambos sem erro. Se `tsc` reclamar de `maybeSingle<LinhaPerfil>()`, confirme que `LinhaPerfil` está exportado em `lib/permissoes.ts`.

---

### Task 3: Componente `Checkbox`

**Files:**
- Create: `components/ui/checkbox.tsx`

**Interfaces:**
- Consumes: nada das tasks anteriores
- Produces: `Checkbox` — aceita as props de `CheckboxPrimitive.Root` do base-ui, incluindo `name`, `defaultChecked`, `checked`, `onCheckedChange`, `disabled`. Renderiza um `<span>` mais um `<input type="checkbox">` escondido, então **funciona dentro de `<form>` com Server Action**.

- [ ] **Step 1: Criar `components/ui/checkbox.tsx`**

Segue o padrão dos outros arquivos de `components/ui/` (aspas duplas, `data-slot`, `cn`).

O estado desabilitado usa `data-disabled:`, não `disabled:`: o base-ui renderiza a raiz como `<span role="checkbox">`, e `:disabled` em CSS só casa com elementos de formulário — a variante `disabled:` do Tailwind não pegaria nunca.

```tsx
"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-items-center text-current"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sem erro. Se `CheckboxPrimitive.Root.Props` não resolver, confira o namespace exportado com:

```bash
cat node_modules/@base-ui/react/checkbox/index.parts.d.ts
```

e ajuste para o nome que aparecer lá (o `dialog.tsx` do projeto usa exatamente esse padrão `X.Root.Props`).

---

### Task 4: Páginas `/sem-acesso`, `app/error.tsx` e guarda no layout de peças

**Files:**
- Create: `app/sem-acesso/page.tsx`
- Create: `app/error.tsx`
- Modify: `app/pecas/layout.tsx`

**Interfaces:**
- Consumes: `perfilAtual()` de `lib/perfil.ts` (Task 2)
- Produces: rota `/sem-acesso` (distingue "desativado" de "sem permissão" e oferece caminho para `/usuarios` a quem ainda tem `gerir_usuarios`); garantia de que `/pecas/*` só renderiza para quem tem `visualizar`; error boundary global em `app/error.tsx`

- [ ] **Step 1: Criar `app/sem-acesso/page.tsx`**

Página autônoma, sem o `Header` — quem cai aqui não tem acesso ao catálogo, então um cabeçalho com link para `/pecas` só geraria um vaivém.

Async, porque distingue "desativado" de "sem permissão" via `perfilAtual()`, e oferece a `/usuarios` como rota de recuperação para o gestor que perdeu `visualizar` (o único jeito de ele se reabilitar sem outro administrador). `Button` aceita a prop `render` (padrão `useRender` do base-ui — ver `components/ui/button.tsx` e o uso em `components/ui/dialog.tsx`), então o link vira `<Button render={<Link ... />}>` em vez de reinventar as classes de `buttonVariants`.

```tsx
import Link from 'next/link'
import { ShieldOff, Users } from 'lucide-react'
import { perfilAtual } from '@/lib/perfil'
import { LogoutButton } from '@/components/logout-button'
import { Button } from '@/components/ui/button'

export default async function SemAcessoPage() {
  const perfil = await perfilAtual()
  const desativado = perfil !== null && !perfil.ativo

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="grid max-w-sm place-items-center gap-4 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
          <ShieldOff className="size-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">
            {desativado ? 'Acesso desativado' : 'Sem acesso'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {desativado
              ? 'Sua conta foi desativada. Fale com um administrador para reativá-la.'
              : 'Sua conta não tem permissão para acessar o catálogo. Peça a um administrador para liberar seu acesso.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* Saída para o gestor que perdeu 'visualizar': ele ainda pode se reabilitar. */}
          {perfil?.permissoes.gerir_usuarios && (
            <Button render={<Link href="/usuarios" />} variant="outline">
              <Users />
              Ir para Usuários
            </Button>
          )}
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Criar `app/error.tsx` (error boundary global — correção da revisão final)**

Não havia nenhum error boundary no app. Se o SQL for aplicado mas faltar `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`, abrir `/usuarios` lançava e o usuário via a tela genérica do Next, sem mensagem em produção.

```tsx
'use client'

import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="grid max-w-md place-items-center gap-4 text-center">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">Algo deu errado</h1>
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar esta página.
          </p>
        </div>
        {error.message && (
          <p className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-left font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
        )}
        <Button type="button" onClick={reset}>
          <RotateCw />
          Tentar de novo
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Guardar `/pecas` no layout**

Substitua `app/pecas/layout.tsx` inteiro por:

```tsx
import { redirect } from 'next/navigation'
import { Header } from '@/components/header'
import { Toaster } from '@/components/ui/sonner'
import { perfilAtual } from '@/lib/perfil'

export default async function PecasLayout({ children }: { children: React.ReactNode }) {
  const perfil = await perfilAtual()
  // Inativo ou sem 'visualizar' não entra. O middleware só garante que existe
  // sessão; a autorização é aqui, no servidor.
  if (!perfil?.permissoes.visualizar) redirect('/sem-acesso')

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <Toaster theme="light" position="bottom-right" />
    </div>
  )
}
```

`perfilAtual()` já devolve `SEM_PERMISSOES` quando o perfil está inativo, então essa única condição cobre os dois casos.

- [ ] **Step 4: Verificar manualmente**

Com `npm run dev` rodando e o seu usuário (que tem todas as permissões), abra `/pecas`.

Esperado: a página abre normalmente. Depois abra `/sem-acesso` direto na URL — esperado: a mensagem e o botão "Sair" (sem o botão "Ir para Usuários", já que este usuário chegou ali só de propósito, com todas as permissões — o botão só aparece para quem tem `gerir_usuarios` mas perdeu `visualizar`).

- [ ] **Step 5: Verificar o build**

```bash
npm run lint
npm run build
```

Esperado: build concluído, com `/sem-acesso` aparecendo na lista de rotas.

---

### Task 5: Leitura e ações de usuários

**Files:**
- Create: `lib/usuarios.ts`
- Create: `app/usuarios/actions.ts`

**Interfaces:**
- Consumes: `createAdminClient()`, `perfilAtual()`, `exigir()`, `PERMISSOES`, `permissoesDaLinha`, `colunasDePermissoes`, `COLUNAS_PERFIL`, `SEM_PERMISSOES`, `type LinhaPerfil`, `type Permissoes`, `mapErro`
- Produces:
  - `lib/usuarios.ts`: `type UsuarioLista = { userId: string; email: string; nome: string | null; ativo: boolean; permissoes: Permissoes }`, `listarUsuarios(): Promise<UsuarioLista[]>`
  - `app/usuarios/actions.ts`: `type EstadoUsuario = { erro: string | null; ok: boolean }`, `criarUsuario(_prev, formData)`, `atualizarUsuario(userId, _prev, formData)`, `redefinirSenha(userId, _prev, formData)`

- [ ] **Step 1: Criar `lib/usuarios.ts`**

```ts
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { perfilAtual } from '@/lib/perfil'
import {
  COLUNAS_PERFIL,
  SEM_PERMISSOES,
  permissoesDaLinha,
  type LinhaPerfil,
  type Permissoes,
} from '@/lib/permissoes'

export type UsuarioLista = {
  userId: string
  email: string
  nome: string | null
  ativo: boolean
  permissoes: Permissoes
}

export async function listarUsuarios(): Promise<UsuarioLista[]> {
  // A service role key ignora RLS, então a checagem tem que estar aqui — o guard
  // do layout não protege uma função chamável de qualquer ponto do servidor.
  const eu = await perfilAtual()
  if (!eu?.permissoes.gerir_usuarios) {
    throw new Error('Sem permissão para listar usuários.')
  }

  // Os e-mails vivem em auth.users, que não é legível via PostgREST — só pela
  // Admin API.
  const admin = createAdminClient()
  const usuariosAuth: { id: string; email?: string }[] = []
  let pagina = 1
  // listUsers pagina; sem o laço, quem cai fora da primeira página fica invisível
  // na tela — e, como a lista é a única origem do userId, intocável.
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 })
    if (error) throw error
    usuariosAuth.push(...data.users)
    if (!data.nextPage) break
    pagina = data.nextPage
  }

  // Os perfis vêm pelo cliente normal, sujeitos ao RLS (o gestor pode ler todos).
  const supabase = await createClient()
  const { data, error } = await supabase.from('perfis').select(COLUNAS_PERFIL)
  if (error) throw error

  const perfis = new Map(
    ((data ?? []) as LinhaPerfil[]).map((p) => [p.user_id, p]),
  )

  return usuariosAuth
    .map((u) => {
      const p = perfis.get(u.id)
      return {
        userId: u.id,
        email: u.email ?? '',
        nome: p?.nome ?? null,
        ativo: p?.ativo ?? false,
        permissoes: p ? permissoesDaLinha(p) : SEM_PERMISSOES,
      }
    })
    .sort((a, b) =>
      (a.nome ?? a.email).localeCompare(b.nome ?? b.email, 'pt-BR'),
    )
}
```

- [ ] **Step 2: Criar `app/usuarios/actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapErro } from '@/lib/erros'
import { exigir, perfilAtual } from '@/lib/perfil'
import { PERMISSOES, colunasDePermissoes, type Permissoes } from '@/lib/permissoes'

export type EstadoUsuario = { erro: string | null; ok: boolean }

const SENHA_MINIMA = 8

// Checkbox desmarcado não é enviado pelo browser: presença do campo = marcado.
function permissoesDoForm(formData: FormData): Permissoes {
  return Object.fromEntries(
    PERMISSOES.map((p) => [p, formData.get(`perm_${p}`) !== null]),
  ) as Permissoes
}

export async function criarUsuario(
  _prev: EstadoUsuario,
  formData: FormData,
): Promise<EstadoUsuario> {
  const erroPermissao = await exigir('gerir_usuarios')
  if (erroPermissao) return { erro: erroPermissao, ok: false }

  const nome = String(formData.get('nome') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const senha = String(formData.get('senha') ?? '')
  const permissoes = permissoesDoForm(formData)

  if (!nome) return { erro: 'Informe o nome.', ok: false }
  if (!email) return { erro: 'Informe o e-mail.', ok: false }
  if (nome.length > 120) return { erro: 'O nome é longo demais.', ok: false }
  if (email.length > 254) return { erro: 'O e-mail é longo demais.', ok: false }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { erro: 'Informe um e-mail válido.', ok: false }
  }
  if (senha.length < SENHA_MINIMA) {
    return { erro: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`, ok: false }
  }

  const admin = createAdminClient()
  // email_confirm: true — o usuário já entra liberado, sem e-mail de confirmação.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (error) {
    const jaExiste =
      error.code === 'email_exists' ||
      /already (been )?registered|already exists/i.test(error.message)
    if (jaExiste) return { erro: 'Este e-mail já tem cadastro.', ok: false }
    console.error('Falha ao criar usuário:', error.message)
    return { erro: 'Não foi possível criar o usuário. Tente novamente.', ok: false }
  }

  const { error: erroPerfil } = await admin.from('perfis').insert({
    user_id: data.user.id,
    nome,
    ativo: true,
    ...colunasDePermissoes(permissoes),
  })
  if (erroPerfil) {
    // Compensação: sem perfil o login não serve para nada, então desfaz a criação.
    const { error: erroLimpeza } = await admin.auth.admin.deleteUser(data.user.id)
    if (erroLimpeza) {
      console.error('Falha ao remover usuário órfão:', data.user.id, erroLimpeza.message)
      return {
        erro: `O perfil não foi salvo e o login criado não pôde ser removido (${email}). Edite esse usuário na lista para completar o cadastro.`,
        ok: false,
      }
    }
    return { erro: mapErro(erroPerfil), ok: false }
  }

  revalidatePath('/usuarios')
  return { erro: null, ok: true }
}

export async function atualizarUsuario(
  userId: string,
  _prev: EstadoUsuario,
  formData: FormData,
): Promise<EstadoUsuario> {
  const erroPermissao = await exigir('gerir_usuarios')
  if (erroPermissao) return { erro: erroPermissao, ok: false }

  const nome = String(formData.get('nome') ?? '').trim()
  const ativo = formData.get('ativo') !== null
  const permissoes = permissoesDoForm(formData)

  if (!nome) return { erro: 'Informe o nome.', ok: false }
  if (nome.length > 120) return { erro: 'O nome é longo demais.', ok: false }

  const eu = await perfilAtual()

  // Travas 1 e 2: ninguém se rebaixa nem se desativa sozinho.
  if (eu?.userId === userId) {
    if (!permissoes.gerir_usuarios) {
      return { erro: 'Você não pode remover a sua própria permissão de gerir usuários.', ok: false }
    }
    if (!ativo) {
      return { erro: 'Você não pode desativar o seu próprio acesso.', ok: false }
    }
  }

  const supabase = await createClient()

  // Invariante "sempre ao menos um gestor ativo": não dá para checar aqui de forma
  // atômica (dois gestores se rebaixando ao mesmo tempo passariam os dois pela
  // checagem). Quem garante isso é o trigger `perfis_garantir_gestor_ativo` no
  // banco (docs/supabase/setup.sql).
  const { data: atualizado, error } = await supabase
    .from('perfis')
    .upsert(
      {
        user_id: userId,
        nome,
        ativo,
        ...colunasDePermissoes(permissoes),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('user_id')
  if (error) {
    // 23503 = foreign_key_violation: o login não existe mais em auth.users.
    if (error.code === '23503') {
      return { erro: 'Este usuário não existe mais. Atualize a página.', ok: false }
    }
    return { erro: mapErro(error), ok: false }
  }
  if (!atualizado?.length) {
    return { erro: 'Não foi possível salvar: o perfil não foi encontrado ou você perdeu a permissão.', ok: false }
  }

  revalidatePath('/usuarios')
  return { erro: null, ok: true }
}

export async function redefinirSenha(
  userId: string,
  _prev: EstadoUsuario,
  formData: FormData,
): Promise<EstadoUsuario> {
  const erroPermissao = await exigir('gerir_usuarios')
  if (erroPermissao) return { erro: erroPermissao, ok: false }

  const senha = String(formData.get('senha') ?? '')
  if (senha.length < SENHA_MINIMA) {
    return { erro: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`, ok: false }
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: senha })
  if (error) {
    // Correção da revisão final: o Supabase pode ter política de senha própria
    // (mínimo maior que 8, proteção contra senha vazada), e devolver a mensagem
    // crua em inglês (error.message) numa interface toda em português confundia
    // o admin. Traduzimos os casos esperados e escondemos o resto atrás de um
    // texto genérico, com log no servidor para investigação.
    if (error.code === 'weak_password' || /password/i.test(error.message)) {
      return {
        erro: 'A senha foi recusada pelo Supabase — ele pode exigir uma senha mais longa ou mais forte que a mínima do formulário.',
        ok: false,
      }
    }
    if (error.code === 'user_not_found') {
      return { erro: 'Este usuário não existe mais. Atualize a página.', ok: false }
    }
    console.error('Falha ao redefinir senha:', userId, error.message)
    return { erro: 'Não foi possível redefinir a senha. Tente novamente.', ok: false }
  }

  return { erro: null, ok: true }
}
```

Repare que `atualizarUsuario` **não** usa o cliente admin: a atualização passa pelo cliente normal e é conferida de novo pelo RLS. Defesa em profundidade de graça.

- [ ] **Step 3: Verificar**

```bash
npm run lint
npx tsc --noEmit
```

Esperado: sem erro. Um erro de tipo em `Object.fromEntries(...) as Permissoes` significa que `PERMISSOES` perdeu o `as const` — confira a Task 2.

---

### Task 6: Telas de gestão de usuários

**Files:**
- Create: `app/usuarios/layout.tsx`
- Create: `app/usuarios/page.tsx`
- Create: `components/usuarios-view.tsx`
- Create: `components/usuario-form.tsx`
- Create: `components/redefinir-senha.tsx`

**Interfaces:**
- Consumes: `listarUsuarios()`, `type UsuarioLista`, `criarUsuario`, `atualizarUsuario`, `redefinirSenha`, `type EstadoUsuario`, `perfilAtual()`, `PERMISSOES`, `ROTULOS`, `Checkbox`
- Produces: rota `/usuarios`

- [ ] **Step 1: Criar `app/usuarios/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { Header } from '@/components/header'
import { Toaster } from '@/components/ui/sonner'
import { perfilAtual } from '@/lib/perfil'

export default async function UsuariosLayout({ children }: { children: React.ReactNode }) {
  const perfil = await perfilAtual()
  if (!perfil?.permissoes.gerir_usuarios) redirect('/sem-acesso')

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <Toaster theme="light" position="bottom-right" />
    </div>
  )
}
```

- [ ] **Step 2: Criar `app/usuarios/page.tsx`**

```tsx
import { listarUsuarios } from '@/lib/usuarios'
import { perfilAtual } from '@/lib/perfil'
import { UsuariosView } from '@/components/usuarios-view'

export default async function UsuariosPage() {
  const [usuarios, perfil] = await Promise.all([listarUsuarios(), perfilAtual()])
  return <UsuariosView usuarios={usuarios} meuId={perfil?.userId ?? ''} />
}
```

- [ ] **Step 3: Criar `components/usuario-form.tsx`**

Um só formulário serve para criar e editar; o que muda é a presença de `usuario`. A redefinição de senha **não** entra aqui: ela é um formulário próprio, e HTML não permite `<form>` dentro de `<form>` — o navegador descarta o interno silenciosamente. Ela vira um componente separado no Step 4, composto ao lado deste no dialog.

```tsx
'use client'

import { useActionState, useEffect } from 'react'
import type { EstadoUsuario } from '@/app/usuarios/actions'
import type { UsuarioLista } from '@/lib/usuarios'
import { PERMISSOES, ROTULOS } from '@/lib/permissoes'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'

type AcaoForm = (state: EstadoUsuario, formData: FormData) => Promise<EstadoUsuario>

const ESTADO_INICIAL: EstadoUsuario = { erro: null, ok: false }

export function UsuarioForm({
  action,
  usuario,
  souEu = false,
  onSuccess,
  submitLabel = 'Salvar',
}: {
  action: AcaoForm
  usuario?: UsuarioLista
  souEu?: boolean
  onSuccess: () => void
  submitLabel?: string
}) {
  const [state, formAction, pending] = useActionState<EstadoUsuario, FormData>(
    action,
    ESTADO_INICIAL,
  )

  useEffect(() => {
    if (state.ok) onSuccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok])

  return (
    <form action={formAction} className="space-y-5">
      {state.erro && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.erro}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" required defaultValue={usuario?.nome ?? ''} />
      </div>

      {usuario ? (
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {usuario.email}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha">Senha inicial</Label>
            <Input
              id="senha"
              name="senha"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
          </div>
        </>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">Permissões</legend>
        {PERMISSOES.map((p) => {
          const travado = souEu && (p === 'gerir_usuarios' || p === 'visualizar')
          return (
            <div key={p} className="flex items-center gap-2.5">
              <Checkbox
                id={`perm_${p}`}
                name={`perm_${p}`}
                defaultChecked={usuario ? usuario.permissoes[p] : p === 'visualizar'}
                disabled={travado}
              />
              {/* Campo desabilitado não é enviado pelo navegador. Sem este hidden, o
                  servidor leria a permissão como "false" e a trava anti-lockout
                  rejeitaria toda edição do próprio perfil. */}
              {travado && <input type="hidden" name={`perm_${p}`} value="on" />}
              <Label htmlFor={`perm_${p}`} className="font-normal">
                {ROTULOS[p]}
              </Label>
            </div>
          )
        })}
        {/* Correção da revisão final: sem 'visualizar' a pessoa nem entra no
            catálogo, então travamos as duas — antes só 'gerir_usuarios' ficava
            travada, e o único administrador podia se desmarcar de 'visualizar'
            e cair em /sem-acesso sem nenhuma trava pegar (ele continuava gestor
            e ativo). */}
        <p className="text-xs text-muted-foreground">
          &ldquo;Visualizar peças&rdquo; é necessária para todas as outras — sem ela a
          pessoa não entra no catálogo.
        </p>
        {souEu && (
          <p className="text-xs text-muted-foreground">
            Você não pode remover o seu próprio acesso de visualização nem a sua
            permissão de gerir usuários.
          </p>
        )}
      </fieldset>

      {usuario && (
        <div className="flex items-center gap-2.5 border-t border-border pt-4">
          <Checkbox
            id="ativo"
            name="ativo"
            defaultChecked={usuario.ativo}
            disabled={souEu}
          />
          {/* Mesmo motivo do hidden acima: desabilitado não é enviado. */}
          {souEu && <input type="hidden" name="ativo" value="on" />}
          <Label htmlFor="ativo" className="font-normal">
            Acesso ativo
          </Label>
        </div>
      )}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
          Cancelar
        </DialogClose>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Salvando…' : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}

```

- [ ] **Step 4: Criar `components/redefinir-senha.tsx`**

Componente próprio, com o próprio `<form>`. O formulário só existe enquanto o painel está aberto — assim cada abertura remonta o componente e zera o `useActionState`, e a segunda redefinição de senha se comporta igual à primeira.

```tsx
'use client'

import { useActionState, useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { redefinirSenha, type EstadoUsuario } from '@/app/usuarios/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function RedefinirSenha({ userId }: { userId: string }) {
  const [aberto, setAberto] = useState(false)

  if (!aberto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <KeyRound />
        Redefinir senha
      </Button>
    )
  }

  return <FormNovaSenha userId={userId} onFechar={() => setAberto(false)} />
}

function FormNovaSenha({
  userId,
  onFechar,
}: {
  userId: string
  onFechar: () => void
}) {
  const [state, formAction, pending] = useActionState<EstadoUsuario, FormData>(
    redefinirSenha.bind(null, userId),
    { erro: null, ok: false },
  )

  useEffect(() => {
    if (state.ok) {
      toast.success('Senha redefinida.')
      onFechar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok])

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-border p-3">
      {state.erro && (
        <p role="alert" className="text-sm text-destructive">
          {state.erro}
        </p>
      )}
      <Label htmlFor="nova-senha">Nova senha</Label>
      <div className="flex gap-2">
        <Input
          id="nova-senha"
          name="senha"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button type="button" variant="ghost" onClick={onFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 5: Criar `components/usuarios-view.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, UserRound, UserRoundX } from 'lucide-react'
import { criarUsuario, atualizarUsuario } from '@/app/usuarios/actions'
import type { UsuarioLista } from '@/lib/usuarios'
import { PERMISSOES, ROTULOS } from '@/lib/permissoes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UsuarioForm } from './usuario-form'
import { RedefinirSenha } from './redefinir-senha'

type Modo = 'novo' | 'editar' | null

export function UsuariosView({
  usuarios,
  meuId,
}: {
  usuarios: UsuarioLista[]
  meuId: string
}) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>(null)
  const [selecionado, setSelecionado] = useState<UsuarioLista | null>(null)

  function aoSucesso(mensagem: string) {
    setModo(null)
    setSelecionado(null)
    router.refresh()
    toast.success(mensagem)
  }

  function editar(u: UsuarioLista) {
    setSelecionado(u)
    setModo('editar')
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Usuários</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {usuarios.length} {usuarios.length === 1 ? 'usuário' : 'usuários'}.
          </p>
        </div>
        <Button size="lg" onClick={() => setModo('novo')}>
          <Plus />
          Novo usuário
        </Button>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {usuarios.map((u) => (
          <li key={u.userId}>
            <button
              type="button"
              onClick={() => editar(u)}
              className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="flex items-start gap-3">
                <span
                  className={
                    u.ativo
                      ? 'grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'
                      : 'grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground'
                  }
                >
                  {u.ativo ? <UserRound className="size-4" /> : <UserRoundX className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {u.nome ?? u.email}
                    {u.userId === meuId && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                </div>
                {!u.ativo && <Badge variant="destructive">Inativo</Badge>}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {PERMISSOES.filter((p) => u.permissoes[p]).map((p) => (
                  <Badge key={p} variant="secondary">
                    {ROTULOS[p]}
                  </Badge>
                ))}
                {PERMISSOES.every((p) => !u.permissoes[p]) && (
                  <span className="text-xs text-muted-foreground">Sem permissões.</span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Novo usuário */}
      <Dialog open={modo === 'novo'} onOpenChange={(aberto) => !aberto && setModo(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>
              O acesso vale assim que você salvar — a pessoa entra com o e-mail e a
              senha definidos aqui.
            </DialogDescription>
          </DialogHeader>
          <UsuarioForm
            action={criarUsuario}
            onSuccess={() => aoSucesso('Usuário criado.')}
            submitLabel="Criar usuário"
          />
        </DialogContent>
      </Dialog>

      {/* Editar usuário */}
      <Dialog open={modo === 'editar'} onOpenChange={(aberto) => !aberto && setModo(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            {selecionado && <DialogDescription>{selecionado.email}</DialogDescription>}
          </DialogHeader>
          {selecionado && (
            <>
              {/* Correção da revisão final: RedefinirSenha vem ANTES do UsuarioForm.
                  O form de edição termina com o DialogFooter (Cancelar/Salvar); se
                  "Redefinir senha" vier depois dele, o botão aparece abaixo do
                  rodapé, como se o diálogo tivesse acabado e surgisse outro botão
                  solto. Mesmo antes na ordem visual, os dois continuam sendo
                  formulários irmãos, não aninhados — por isso ficam fora um do
                  outro no JSX (HTML não permite <form> dentro de <form>). */}
              <RedefinirSenha userId={selecionado.userId} />
              <UsuarioForm
                action={atualizarUsuario.bind(null, selecionado.userId)}
                usuario={selecionado}
                souEu={selecionado.userId === meuId}
                onSuccess={() => aoSucesso('Alterações salvas.')}
                submitLabel="Salvar"
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 6: Verificar**

```bash
npm run lint
npm run build
```

Esperado: build limpo, com `/usuarios` na lista de rotas.

- [ ] **Step 7: Verificar manualmente o caminho feliz**

Com `npm run dev`, abra `/usuarios` com o seu login (que tem `gerir_usuarios`).

Esperado: a lista mostra os usuários existentes, todos com as cinco badges e sem marca "Inativo". Crie um usuário de teste (`teste@exemplo.com`, senha de 8+ caracteres) marcando **só** "Visualizar peças".

Esperado: toast "Usuário criado." e o novo cartão aparecendo com uma única badge.

---

### Task 7: Link "Usuários" no header

**Files:**
- Modify: `components/header.tsx`

**Interfaces:**
- Consumes: `perfilAtual()` de `lib/perfil.ts`
- Produces: link `/usuarios` visível só para quem tem `gerir_usuarios`

- [ ] **Step 1: Substituir `components/header.tsx`**

O header hoje instancia o cliente Supabase só para pegar o e-mail; `perfilAtual()` já entrega e-mail e permissões numa chamada.

```tsx
import Link from "next/link";
import { Users, Wrench } from "lucide-react";
import { perfilAtual } from "@/lib/perfil";
import { InstallButton } from "./install-button";
import { LogoutButton } from "./logout-button";

export async function Header() {
  const perfil = await perfilAtual();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/pecas" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Wrench className="size-5" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Catálogo de Peças
            </span>
            <span className="text-xs text-muted-foreground">Manutenção</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {perfil?.permissoes.gerir_usuarios && (
            <Link
              href="/usuarios"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Users className="size-4" />
              <span className="hidden sm:inline">Usuários</span>
            </Link>
          )}
          {perfil?.email && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {perfil.email}
            </span>
          )}
          <InstallButton />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verificar manualmente**

Recarregue `/pecas` com o seu login. Esperado: o link "Usuários" aparece ao lado do e-mail. Entre com o usuário de teste criado na Task 6 (que só tem "Visualizar") — esperado: o link **não** aparece, e digitar `/usuarios` na URL redireciona para `/sem-acesso`.

- [ ] **Step 3: Verificar o build**

```bash
npm run lint && npm run build
```

Esperado: sem erro.

---

### Task 8: Aplicar as permissões no módulo de peças

**Files:**
- Modify: `app/pecas/actions.ts` (três funções)
- Modify: `app/pecas/page.tsx`
- Modify: `components/pecas-view.tsx`
- Modify: `components/peca-detalhe.tsx`

**Interfaces:**
- Consumes: `exigir()`, `perfilAtual()`, `type Permissoes`
- Produces: `PecasView` passa a receber `permissoes: Permissoes`; `PecaDetalhe` passa a receber `podeEditar: boolean` e `podeExcluir: boolean`

- [ ] **Step 1: Checar permissão nas três Server Actions de peça**

Em `app/pecas/actions.ts`, acrescente o import:

```ts
import { exigir } from '@/lib/perfil'
```

Em `criarPeca`, insira como **primeira** instrução do corpo:

```ts
  const erroPermissao = await exigir('criar')
  if (erroPermissao) return { erro: erroPermissao, ok: false }
```

Em `atualizarPeca`, a mesma coisa com `'editar'`:

```ts
  const erroPermissao = await exigir('editar')
  if (erroPermissao) return { erro: erroPermissao, ok: false }
```

Em `excluirPeca`, com `'excluir'`:

```ts
  const erroPermissao = await exigir('excluir')
  if (erroPermissao) return { erro: erroPermissao, ok: false }
```

A checagem vem **antes** da validação dos campos: não faz sentido reclamar de descrição vazia para quem nem podia cadastrar.

- [ ] **Step 2: Passar as permissões para a view em `app/pecas/page.tsx`**

```tsx
import { listarPecas, listarCategorias } from '@/lib/pecas'
import { perfilAtual } from '@/lib/perfil'
import { SEM_PERMISSOES } from '@/lib/permissoes'
import { PecasView } from '@/components/pecas-view'

export default async function PecasPage() {
  const [pecas, categorias, perfil] = await Promise.all([
    listarPecas(),
    listarCategorias(),
    perfilAtual(),
  ])
  return (
    <PecasView
      pecas={pecas}
      categorias={categorias}
      permissoes={perfil?.permissoes ?? SEM_PERMISSOES}
    />
  )
}
```

- [ ] **Step 3: Esconder o que não pode em `components/pecas-view.tsx`**

Acrescente o import do tipo:

```tsx
import type { Permissoes } from '@/lib/permissoes'
```

Troque a assinatura do componente:

```tsx
export function PecasView({
  pecas,
  categorias,
  permissoes,
}: {
  pecas: PecaLista[]
  categorias: Categoria[]
  permissoes: Permissoes
}) {
```

Troque o botão "Nova peça" do topo (hoje sempre visível) por:

```tsx
        {permissoes.criar && (
          <Button size="lg" onClick={() => setModo('nova')}>
            <Plus />
            Nova peça
          </Button>
        )}
```

No bloco de estado vazio, troque o texto e o botão por:

```tsx
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {permissoes.criar ? 'Comece seu catálogo' : 'Nenhuma peça cadastrada'}
            </p>
            <p className="text-sm text-muted-foreground">
              {permissoes.criar
                ? 'Cadastre a primeira peça com fotos e documentos.'
                : 'Assim que alguém cadastrar peças, elas aparecem aqui.'}
            </p>
          </div>
          {permissoes.criar && (
            <Button size="lg" onClick={() => setModo('nova')}>
              <Plus />
              Nova peça
            </Button>
          )}
```

No dialog de detalhe, passe as permissões adiante:

```tsx
            <PecaDetalhe
              peca={pecaSel}
              podeEditar={permissoes.editar}
              podeExcluir={permissoes.excluir}
              onEditar={() => setModo('editar')}
              onExcluir={excluir}
            />
```

- [ ] **Step 4: Condicionar os botões em `components/peca-detalhe.tsx`**

Troque a assinatura:

```tsx
export function PecaDetalhe({
  peca,
  podeEditar,
  podeExcluir,
  onEditar,
  onExcluir,
}: {
  peca: PecaDetalheData
  podeEditar: boolean
  podeExcluir: boolean
  onEditar: () => void
  onExcluir: () => void | Promise<void>
}) {
```

Troque o `<DialogFooter>` inteiro por:

```tsx
      {(podeEditar || podeExcluir) && (
        <DialogFooter className="sm:justify-between">
          {podeExcluir &&
            (confirmando ? (
              <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
                <span className="self-center text-sm text-muted-foreground">
                  Confirmar exclusão?
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmando(false)}
                    disabled={excluindo}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={confirmarExclusao}
                    disabled={excluindo}
                  >
                    <Trash2 />
                    {excluindo ? 'Excluindo…' : 'Sim, excluir'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="destructive" onClick={() => setConfirmando(true)}>
                <Trash2 />
                Excluir
              </Button>
            ))}

          {podeEditar && !confirmando && (
            <Button type="button" variant="default" size="lg" onClick={onEditar}>
              <Pencil />
              Editar
            </Button>
          )}
        </DialogFooter>
      )}
```

- [ ] **Step 5: Verificar**

```bash
npm run lint && npm run build
```

Esperado: sem erro. Se `tsc` acusar props faltando em `PecaDetalhe`, algum ponto de chamada ficou para trás — só existe um, em `pecas-view.tsx`.

- [ ] **Step 6: Verificar manualmente com o usuário restrito**

Entre com o usuário de teste que só tem "Visualizar".

Esperado: a lista de peças aparece; o botão "Nova peça" não; ao abrir uma peça, nem "Editar" nem "Excluir" aparecem, e o rodapé do dialog some por inteiro.

---

### Task 9: Verificação final — matriz de permissões e teste de RLS por fora do app

Esta task não escreve código. Ela é o que separa "parece funcionar" de "funciona".

**Files:** nenhum

**Interfaces:**
- Consumes: tudo das tasks anteriores
- Produces: confirmação de que app e banco concordam

- [ ] **Step 1: Preparar os usuários de teste**

Em `/usuarios`, deixe assim:
- **Você**: as cinco permissões, ativo.
- **teste@exemplo.com**: só `visualizar`, ativo.

- [ ] **Step 2: Rodar a matriz na interface**

Para cada linha, entre com o usuário indicado (janela anônima ajuda a manter as duas sessões).

| Usuário | Ação | Esperado |
|---|---|---|
| teste | abrir `/pecas` | lista aparece |
| teste | botão "Nova peça" | não existe na tela |
| teste | abrir uma peça | sem botões "Editar"/"Excluir" |
| teste | abrir `/usuarios` pela URL | redireciona para `/sem-acesso` |
| você | marcar `criar` para teste, recarregar como teste | "Nova peça" aparece e o cadastro conclui |
| você | marcar `editar`, recarregar como teste | "Editar" aparece e salvar funciona |
| você | marcar `excluir`, recarregar como teste | "Excluir" aparece e exclui |
| você | desmarcar `visualizar` de teste, recarregar como teste | cai em `/sem-acesso` |
| você | desmarcar "Acesso ativo" de teste, recarregar como teste | cai em `/sem-acesso` |

- [ ] **Step 3: Testar as travas de lockout**

| Tentativa | Esperado |
|---|---|
| Abrir seu próprio usuário e desmarcar "Gerir usuários" | checkbox desabilitado; se forçar via HTML, a ação responde "Você não pode remover a sua própria permissão de gerir usuários." |
| Abrir seu próprio usuário e desmarcar "Acesso ativo" | checkbox desabilitado; se forçar, responde "Você não pode desativar o seu próprio acesso." |
| Tentar deixar o sistema sem gestor ativo (dois gestores se rebaixando ao mesmo tempo) | O trigger `perfis_garantir_gestor_ativo` aborta a segunda transação com "Precisa existir pelo menos um usuário ativo com permissão de gerir usuários." Difícil de reproduzir à mão; a checagem que vale é a do banco. |

Ao terminar, devolva as permissões: você com as cinco, ativo.

- [ ] **Step 4: Provar que o RLS segura sem a interface**

Este é o passo que importa. Deixe **teste** com só `visualizar`, ativo.

Pegue a anon key de `.env.local` e o token do usuário restrito. No terminal (Git Bash):

```bash
SUPABASE_URL="<valor de NEXT_PUBLIC_SUPABASE_URL>"
ANON="<valor de NEXT_PUBLIC_SUPABASE_ANON_KEY>"

# 1) Login como o usuário restrito, para obter o access_token
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"teste@exemplo.com","password":"<a senha que você definiu>"}'
```

Copie o `access_token` da resposta para a variável `TOKEN` e rode:

```bash
TOKEN="<access_token>"

# 2) SELECT — deve FUNCIONAR (o usuário tem 'visualizar')
curl -s "$SUPABASE_URL/rest/v1/pecas?select=id,descricao&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"

# 3) INSERT — deve FALHAR (não tem 'criar')
curl -s -X POST "$SUPABASE_URL/rest/v1/pecas" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"descricao":"tentativa direta"}'
```

Esperado no passo 2: um array JSON com a peça.
Esperado no passo 3: `{"code":"42501", ... "new row violates row-level security policy ..."}`.

Se o INSERT passar, o RLS não está valendo — volte à Task 1, Step 5, e procure a policy com `qual = true`.

- [ ] **Step 5: Limpar**

Remova a peça criada por engano, se o passo anterior tiver deixado alguma. O usuário `teste@exemplo.com` pode ficar desativado em vez de apagado (excluir usuário está fora do escopo deste módulo).

- [ ] **Step 6: Verificação final do projeto**

```bash
npm run lint
npm run build
```

Esperado: os dois limpos. Reporte o resultado real; se algo falhar, mostre a saída em vez de afirmar que passou.

---

## Nota sobre commits

O usuário pediu para não commitar. Ao final da Task 9, todos os arquivos ficam no working tree. Se ele quiser commitar depois, os arquivos de `docs/superpowers/` (spec e plano) ficam de fora por convenção do projeto — só o código de implementação entra.
