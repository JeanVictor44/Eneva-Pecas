# Catálogo de Peças — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web interno (Next.js + Supabase) para login por e-mail/senha e CRUD de peças com múltiplas fotos e documentos.

**Architecture:** Next.js App Router + TypeScript. Autenticação via `@supabase/ssr` (sessão em cookies), rotas protegidas por `middleware.ts`. Leituras em Server Components; escritas e uploads em Server Actions usando a anon key + RLS. Fotos em bucket público, documentos em bucket privado (URL assinada). Detalhe exibido como modal com URL própria via parallel + intercepting routes.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, `@supabase/ssr`, `@supabase/supabase-js`, Supabase (Postgres + Auth + Storage).

## Global Constraints

- **Idioma da UI e nomes de domínio:** português (pt-BR). Tabelas/colunas conforme spec: `pecas`, `pecas_anexos`.
- **Sem tela de cadastro (sign up):** usuários criados no painel do Supabase. Apenas login/logout na app.
- **Catálogo compartilhado:** qualquer usuário `authenticated` pode ver/criar/editar/excluir qualquer peça.
- **Env vars (nunca commitar `.env.local`):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. (No dashboard novo do Supabase a anon key pode aparecer como "anon public"/"publishable key" — é a mesma coisa.)
- **Cookies do Supabase:** SEMPRE o padrão `getAll`/`setAll` do `@supabase/ssr`. Nunca `get/set/remove`.
- **Paleta (tema manutenção):** acento âmbar→laranja→vermelho-telha (`brand-500 #f59e0b`, `brand-600 #f97316`, `brand-700 #ea580c`); neutros de aço (`steel-*` = valores slate). SKU e part number em fonte monoespaçada.
- **Buckets:** `pecas-fotos` (público), `pecas-documentos` (privado). Arquivos em `pecas/{peca_id}/{uuid}.{ext}`.
- **Verificação (decisão da spec):** sem testes automatizados nesta fase. O "ciclo de teste" de cada task é: `npx tsc --noEmit` (ou `npm run build`) + verificação manual no navegador. Cada task termina com commit.

> **Nota de deslocamento do TDD:** a skill de planos assume TDD; aqui seguimos a decisão explícita da spec (validação manual + checagem de tipos). Onde há lógica pura testável de forma barata (ex.: `mapErro`), o passo de verificação exercita a função manualmente via `tsc`/execução.

---

## Estrutura de arquivos

```
eneva-pecas/
  middleware.ts                       # proteção de rotas
  .env.local                          # credenciais (gitignored)
  .env.local.example                  # modelo commitável
  app/
    layout.tsx                        # html/body + globals
    globals.css                       # Tailwind + tema (paleta)
    page.tsx                          # redirect -> /pecas
    login/
      page.tsx                        # server: redireciona se logado
      login-form.tsx                  # client: formulário
      actions.ts                      # entrar / sair (server actions)
    pecas/
      layout.tsx                      # Header + slot @modal
      page.tsx                        # lista (grade de cards)
      actions.ts                      # criarPeca / atualizarPeca / excluirPeca
      nova/page.tsx                   # form de criação
      [id]/
        page.tsx                      # detalhe (página cheia)
        editar/page.tsx               # form de edição
      @modal/
        default.tsx                   # null
        (.)[id]/page.tsx              # detalhe interceptado (modal)
  components/
    header.tsx                        # server: email do user + logout
    logout-button.tsx                 # client
    peca-card.tsx
    peca-form.tsx                     # client: create+edit
    peca-detalhe.tsx                  # conteúdo do detalhe (reuso modal/página)
    galeria-fotos.tsx                 # client: grade + lightbox
    modal.tsx                         # client: shell do modal
    botao-excluir.tsx                 # client: confirmação
  lib/
    tipos.ts                          # tipos de domínio
    erros.ts                          # mapErro
    supabase/
      client.ts                       # createBrowserClient
      server.ts                       # createServerClient (cookies)
      middleware.ts                   # updateSession
    pecas.ts                          # listarPecas / buscarPeca
    storage.ts                        # nomes de bucket
  docs/superpowers/...                # spec + este plano
```

---

## Task 1: Scaffold do projeto + dependências + tema

**Files:**
- Create: projeto Next.js na raiz (via `create-next-app`)
- Create: `.env.local`, `.env.local.example`
- Modify: `app/globals.css` (paleta), `app/page.tsx` (redirect)

**Interfaces:**
- Produces: projeto Next.js rodável; classes Tailwind `brand-*` e `steel-*`; `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

- [ ] **Step 1: Mover `docs/` para fora (create-next-app recusa diretório com pastas desconhecidas)**

PowerShell, na raiz do projeto:
```powershell
Move-Item docs ..\eneva-pecas-docs-tmp
```

- [ ] **Step 2: Rodar create-next-app na pasta atual**

```powershell
npx create-next-app@latest . --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm --yes
```
Se perguntar sobre Turbopack, aceitar o padrão. Ao final existe `package.json`, `app/`, `tailwind` configurado.

- [ ] **Step 3: Restaurar `docs/`**

```powershell
Move-Item ..\eneva-pecas-docs-tmp docs
```

- [ ] **Step 4: Instalar dependências do Supabase**

```powershell
npm install @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 5: Criar `.env.local.example` e `.env.local`**

`.env.local.example` (commitável):
```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
```
`.env.local` (NÃO commitar): copie o exemplo e preencha com a URL e a anon key reais do projeto (Supabase → Project Settings → API).

Garantir no `.gitignore` (o create-next-app pode tê-lo sobrescrito) que ele ignora `.env.local` mas **permite** o exemplo. Confirmar/ajustar para conter estas linhas (trocar um eventual `.env*` por `.env*.local`):
```
# env
.env*.local
!.env.local.example
```
Assim `.env.local` fica ignorado e `.env.local.example` pode ser commitado.

- [ ] **Step 6: Definir a paleta no `app/globals.css`**

Substituir o conteúdo por (assumindo Tailwind v4, padrão atual do create-next-app — usa `@theme`):
```css
@import "tailwindcss";

@theme {
  --color-brand-50:  #fff7ed;
  --color-brand-100: #ffedd5;
  --color-brand-200: #fed7aa;
  --color-brand-300: #fdba74;
  --color-brand-400: #fb923c;
  --color-brand-500: #f59e0b;
  --color-brand-600: #f97316;
  --color-brand-700: #ea580c;
  --color-brand-800: #c2410c;
  --color-brand-900: #9a3412;

  --color-steel-50:  #f8fafc;
  --color-steel-100: #f1f5f9;
  --color-steel-200: #e2e8f0;
  --color-steel-300: #cbd5e1;
  --color-steel-400: #94a3b8;
  --color-steel-500: #64748b;
  --color-steel-600: #475569;
  --color-steel-700: #334155;
  --color-steel-800: #1e293b;
  --color-steel-900: #0f172a;
}

body { @apply bg-steel-50 text-steel-800; }
@media (prefers-color-scheme: dark) {
  body { @apply bg-steel-900 text-steel-100; }
}
```
> Se o create-next-app instalou Tailwind v3 (existe `tailwind.config.ts` e o CSS usa `@tailwind base`), coloque os mapas `brand`/`steel` em `theme.extend.colors` do `tailwind.config.ts` em vez do bloco `@theme`.

- [ ] **Step 7: `app/page.tsx` redireciona para `/pecas`**

```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/pecas')
}
```

- [ ] **Step 8: Verificar build/typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.
Run: `npm run dev` e abrir `http://localhost:3000` → redireciona para `/pecas` (que ainda dá 404 até a Task 6; ok). Encerrar com Ctrl+C.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Tailwind + Supabase deps e tema"
```

---

## Task 2: Banco de dados e Storage (setup no Supabase)

**Files:**
- Create: `docs/supabase/setup.sql` (script de referência, versionado)

**Interfaces:**
- Produces: tabelas `public.pecas`, `public.pecas_anexos` (com RLS e policies); buckets `pecas-fotos` (público) e `pecas-documentos` (privado) com policies.

- [ ] **Step 1: Escrever `docs/supabase/setup.sql`**

```sql
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
```

- [ ] **Step 2: Executar o SQL no Supabase**

No painel do Supabase → **SQL Editor** → colar o conteúdo de `docs/supabase/setup.sql` → **Run**.
Expected: "Success. No rows returned". Se alguma policy já existir, o Run acusa erro de policy duplicada — nesse caso, ignore/remova as linhas já aplicadas.

- [ ] **Step 3: Criar um usuário de teste**

Supabase → **Authentication → Users → Add user** → informar e-mail e senha. Marcar como confirmado (auto-confirm) para poder logar.

- [ ] **Step 4: Verificar**

Supabase → **Table Editor**: existem `pecas` e `pecas_anexos`.
Supabase → **Storage**: existem `pecas-fotos` (público) e `pecas-documentos` (privado).

- [ ] **Step 5: Commit**

```bash
git add docs/supabase/setup.sql
git commit -m "feat(db): schema, RLS e buckets do Supabase"
```

---

## Task 3: Clientes Supabase + middleware de sessão

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `middleware.ts`

**Interfaces:**
- Produces:
  - `createClient()` (browser) em `lib/supabase/client.ts` → `SupabaseClient`
  - `createClient()` (server, async) em `lib/supabase/server.ts` → `Promise<SupabaseClient>`
  - `updateSession(request: NextRequest): Promise<NextResponse>` em `lib/supabase/middleware.ts`

- [ ] **Step 1: `lib/supabase/client.ts` (browser)**

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 2: `lib/supabase/server.ts` (server)**

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Chamado de um Server Component — ignorável quando o middleware
            // já cuida de renovar a sessão.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 3: `lib/supabase/middleware.ts` (renovação de sessão + guarda)**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // NÃO colocar código entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const rotaPublica = pathname.startsWith('/login')

  if (!user && !rotaPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

- [ ] **Step 4: `middleware.ts` (raiz)**

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` → sem erros.
Run: `npm run dev`, abrir `http://localhost:3000` sem sessão → deve redirecionar para `/login` (que ainda dá 404 até a Task 4; o importante é o redirect acontecer). Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase middleware.ts
git commit -m "feat(auth): clientes Supabase e middleware de proteção de rotas"
```

---

## Task 4: Login e logout

**Files:**
- Create: `lib/erros.ts`, `app/login/actions.ts`, `app/login/login-form.tsx`, `app/login/page.tsx`

**Interfaces:**
- Consumes: `createClient` de `lib/supabase/server.ts`.
- Produces:
  - `mapErro(error: { code?: string; message?: string }): string` em `lib/erros.ts`
  - `entrar(prev: EstadoAuth, formData: FormData): Promise<EstadoAuth>` e `sair(): Promise<void>` em `app/login/actions.ts`, onde `type EstadoAuth = { erro: string | null }`

- [ ] **Step 1: `lib/erros.ts`**

```ts
export function mapErro(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Erro desconhecido.'
  // 23505 = unique_violation (Postgres)
  if (error.code === '23505' || /duplicate key/i.test(error.message ?? '')) {
    return 'SKU já cadastrado.'
  }
  return error.message ?? 'Ocorreu um erro.'
}
```

- [ ] **Step 2: `app/login/actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type EstadoAuth = { erro: string | null }

export async function entrar(
  _prev: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { erro: 'Informe e-mail e senha.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { erro: 'E-mail ou senha inválidos.' }
  }

  revalidatePath('/', 'layout')
  redirect('/pecas')
}

export async function sair() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
```

- [ ] **Step 3: `app/login/login-form.tsx` (client)**

```tsx
'use client'

import { useActionState } from 'react'
import { entrar, type EstadoAuth } from './actions'

const inicial: EstadoAuth = { erro: null }

export function LoginForm() {
  const [state, action, pending] = useActionState(entrar, inicial)

  return (
    <form
      action={action}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-steel-200 bg-white p-8 shadow-sm dark:border-steel-700 dark:bg-steel-800"
    >
      <div>
        <h1 className="text-xl font-bold text-steel-800 dark:text-steel-100">
          Catálogo de Peças
        </h1>
        <p className="text-sm text-steel-500">Entre para continuar</p>
      </div>

      {state?.erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.erro}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">E-mail</label>
        <input
          id="email" name="email" type="email" required autoComplete="email"
          className="w-full rounded-lg border border-steel-300 px-3 py-2 outline-none focus:border-brand-600 dark:bg-steel-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">Senha</label>
        <input
          id="password" name="password" type="password" required autoComplete="current-password"
          className="w-full rounded-lg border border-steel-300 px-3 py-2 outline-none focus:border-brand-600 dark:bg-steel-900"
        />
      </div>

      <button
        type="submit" disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: `app/login/page.tsx` (server — redireciona se já logado)**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) redirect('/pecas')

  return (
    <main className="flex min-h-dvh items-center justify-center bg-steel-100 p-4 dark:bg-steel-900">
      <LoginForm />
    </main>
  )
}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` → sem erros.
Run: `npm run dev`. Em `/login`: logar com o usuário criado na Task 2 → redireciona para `/pecas` (ainda 404 até a Task 6). Senha errada → mostra "E-mail ou senha inválidos.". Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add lib/erros.ts app/login
git commit -m "feat(auth): telas de login e logout"
```

---

## Task 5: Tipos, storage e camada de dados (leitura)

**Files:**
- Create: `lib/tipos.ts`, `lib/storage.ts`, `lib/pecas.ts`

**Interfaces:**
- Consumes: `createClient` (server), buckets.
- Produces:
  - `lib/tipos.ts`: `type TipoAnexo = 'foto' | 'documento'`; `type Anexo = { id: string; peca_id: string; tipo: TipoAnexo; path: string; nome: string | null; mime_type: string | null; tamanho: number | null; created_at: string }`
  - `lib/storage.ts`: `BUCKET_FOTOS = 'pecas-fotos'`, `BUCKET_DOCS = 'pecas-documentos'`
  - `lib/pecas.ts`:
    - `type PecaLista = { id: string; sku: string; part_number: string; descricao: string; capaUrl: string | null; qtdFotos: number; qtdDocs: number }`
    - `type AnexoComUrl = Anexo & { url: string }`
    - `type PecaDetalheData = { id: string; sku: string; part_number: string; descricao: string; created_at: string; fotos: AnexoComUrl[]; documentos: AnexoComUrl[] }`
    - `listarPecas(): Promise<PecaLista[]>`
    - `buscarPeca(id: string): Promise<PecaDetalheData | null>`

- [ ] **Step 1: `lib/tipos.ts`**

```ts
export type TipoAnexo = 'foto' | 'documento'

export type Anexo = {
  id: string
  peca_id: string
  tipo: TipoAnexo
  path: string
  nome: string | null
  mime_type: string | null
  tamanho: number | null
  created_at: string
}
```

- [ ] **Step 2: `lib/storage.ts`**

```ts
export const BUCKET_FOTOS = 'pecas-fotos'
export const BUCKET_DOCS = 'pecas-documentos'
```

- [ ] **Step 3: `lib/pecas.ts`**

```ts
import { createClient } from '@/lib/supabase/server'
import { BUCKET_FOTOS, BUCKET_DOCS } from '@/lib/storage'
import type { Anexo } from '@/lib/tipos'

export type PecaLista = {
  id: string
  sku: string
  part_number: string
  descricao: string
  capaUrl: string | null
  qtdFotos: number
  qtdDocs: number
}

export type AnexoComUrl = Anexo & { url: string }

export type PecaDetalheData = {
  id: string
  sku: string
  part_number: string
  descricao: string
  created_at: string
  fotos: AnexoComUrl[]
  documentos: AnexoComUrl[]
}

export async function listarPecas(): Promise<PecaLista[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pecas')
    .select('id, sku, part_number, descricao, anexos:pecas_anexos(tipo, path)')
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map((p) => {
    const anexos = (p.anexos ?? []) as { tipo: string; path: string }[]
    const fotos = anexos.filter((a) => a.tipo === 'foto')
    const docs = anexos.filter((a) => a.tipo === 'documento')
    const capa = fotos[0]
    const capaUrl = capa
      ? supabase.storage.from(BUCKET_FOTOS).getPublicUrl(capa.path).data.publicUrl
      : null
    return {
      id: p.id,
      sku: p.sku,
      part_number: p.part_number,
      descricao: p.descricao,
      capaUrl,
      qtdFotos: fotos.length,
      qtdDocs: docs.length,
    }
  })
}

export async function buscarPeca(id: string): Promise<PecaDetalheData | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pecas')
    .select('id, sku, part_number, descricao, created_at, anexos:pecas_anexos(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const anexos = (data.anexos ?? []) as Anexo[]

  const fotos: AnexoComUrl[] = anexos
    .filter((a) => a.tipo === 'foto')
    .map((a) => ({
      ...a,
      url: supabase.storage.from(BUCKET_FOTOS).getPublicUrl(a.path).data.publicUrl,
    }))

  const documentos: AnexoComUrl[] = []
  for (const a of anexos.filter((x) => x.tipo === 'documento')) {
    const { data: signed } = await supabase
      .storage
      .from(BUCKET_DOCS)
      .createSignedUrl(a.path, 3600)
    documentos.push({ ...a, url: signed?.signedUrl ?? '#' })
  }

  return {
    id: data.id,
    sku: data.sku,
    part_number: data.part_number,
    descricao: data.descricao,
    created_at: data.created_at,
    fotos,
    documentos,
  }
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/tipos.ts lib/storage.ts lib/pecas.ts
git commit -m "feat(dados): tipos e camada de leitura de peças"
```

---

## Task 6: Layout protegido, header e lista de peças

**Files:**
- Create: `components/header.tsx`, `components/logout-button.tsx`, `components/peca-card.tsx`, `app/pecas/layout.tsx`, `app/pecas/page.tsx`, `app/pecas/@modal/default.tsx`

**Interfaces:**
- Consumes: `listarPecas`, `PecaLista`, `createClient` (server), `sair`.
- Produces: `Header`, `LogoutButton`, `PecaCard`, layout de `/pecas` com slot `modal`.

- [ ] **Step 1: `components/logout-button.tsx` (client)**

```tsx
'use client'

import { sair } from '@/app/login/actions'

export function LogoutButton() {
  return (
    <form action={sair}>
      <button
        type="submit"
        className="rounded-lg border border-steel-300 px-3 py-1.5 text-sm text-steel-700 transition hover:bg-steel-100 dark:border-steel-600 dark:text-steel-200 dark:hover:bg-steel-800"
      >
        Sair
      </button>
    </form>
  )
}
```

- [ ] **Step 2: `components/header.tsx` (server)**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LogoutButton } from './logout-button'

export async function Header() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  return (
    <header className="border-b border-steel-200 bg-white dark:border-steel-700 dark:bg-steel-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/pecas" className="flex items-center gap-2 font-bold text-steel-800 dark:text-steel-100">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">⚙</span>
          Catálogo de Peças
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-steel-500 sm:inline">{data.user?.email}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: `app/pecas/@modal/default.tsx`**

```tsx
export default function Default() {
  return null
}
```

- [ ] **Step 4: `app/pecas/layout.tsx` (children + slot modal)**

```tsx
import { Header } from '@/components/header'

export default function PecasLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      {modal}
    </div>
  )
}
```

- [ ] **Step 5: `components/peca-card.tsx`**

```tsx
import Link from 'next/link'
import type { PecaLista } from '@/lib/pecas'

export function PecaCard({ peca }: { peca: PecaLista }) {
  return (
    <Link
      href={`/pecas/${peca.id}`}
      className="group block overflow-hidden rounded-2xl border border-steel-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-steel-700 dark:bg-steel-800"
    >
      <div className="aspect-[4/3] bg-steel-100 dark:bg-steel-700">
        {peca.capaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={peca.capaUrl} alt={peca.sku} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-steel-400">sem foto</div>
        )}
      </div>
      <div className="p-4">
        <p className="font-mono text-sm font-semibold text-brand-700">{peca.sku}</p>
        <p className="font-mono text-xs text-steel-500">{peca.part_number}</p>
        <p className="mt-1 line-clamp-2 text-sm text-steel-700 dark:text-steel-300">
          {peca.descricao}
        </p>
        <div className="mt-3 flex gap-3 text-xs text-steel-500">
          <span>📷 {peca.qtdFotos}</span>
          <span>📄 {peca.qtdDocs}</span>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 6: `app/pecas/page.tsx` (lista)**

```tsx
import Link from 'next/link'
import { listarPecas } from '@/lib/pecas'
import { PecaCard } from '@/components/peca-card'

export default async function PecasPage() {
  const pecas = await listarPecas()

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-steel-800 dark:text-steel-100">Peças</h1>
        <Link
          href="/pecas/nova"
          className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition hover:bg-brand-700"
        >
          + Nova peça
        </Link>
      </div>

      {pecas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-steel-300 p-12 text-center text-steel-500">
          Nenhuma peça cadastrada ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pecas.map((p) => (
            <PecaCard key={p.id} peca={p} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Verificar**

Run: `npx tsc --noEmit` → sem erros.
Run: `npm run dev`, logar, ver `/pecas` com header, e-mail do usuário, botão Sair (funciona → volta a `/login`) e estado vazio "Nenhuma peça". Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add components app/pecas
git commit -m "feat(pecas): layout protegido, header e lista de peças"
```

---

## Task 7: Cadastro de peça (create) com upload de fotos e documentos

**Files:**
- Create: `app/pecas/actions.ts` (parcial: `criarPeca` + helper `enviarAnexos`), `components/peca-form.tsx`, `app/pecas/nova/page.tsx`

**Interfaces:**
- Consumes: `createClient` (server), `BUCKET_FOTOS`/`BUCKET_DOCS`, `mapErro`, `PecaDetalheData` (para reuso no form; opcional aqui).
- Produces:
  - `type EstadoPeca = { erro: string | null }`
  - `criarPeca(prev: EstadoPeca, formData: FormData): Promise<EstadoPeca>` em `app/pecas/actions.ts`
  - `PecaForm` (client) com props `{ action: (s: EstadoPeca, fd: FormData) => Promise<EstadoPeca>; titulo: string; peca?: PecaDetalheData }`

- [ ] **Step 1: `app/pecas/actions.ts` — `criarPeca` + `enviarAnexos`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { BUCKET_FOTOS, BUCKET_DOCS } from '@/lib/storage'
import { mapErro } from '@/lib/erros'

export type EstadoPeca = { erro: string | null }

function arquivosDe(formData: FormData, campo: string): File[] {
  return formData
    .getAll(campo)
    .filter((f): f is File => f instanceof File && f.size > 0)
}

async function enviarAnexos(
  supabase: SupabaseClient,
  pecaId: string,
  fotos: File[],
  documentos: File[],
): Promise<string | null> {
  const jobs: { bucket: string; tipo: 'foto' | 'documento'; file: File }[] = [
    ...fotos.map((file) => ({ bucket: BUCKET_FOTOS, tipo: 'foto' as const, file })),
    ...documentos.map((file) => ({ bucket: BUCKET_DOCS, tipo: 'documento' as const, file })),
  ]

  for (const { bucket, tipo, file } of jobs) {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const path = `pecas/${pecaId}/${crypto.randomUUID()}.${ext}`

    const up = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type || undefined,
    })
    if (up.error) return `Falha ao enviar ${tipo}: ${up.error.message}`

    const ins = await supabase.from('pecas_anexos').insert({
      peca_id: pecaId,
      tipo,
      path,
      nome: file.name,
      mime_type: file.type || null,
      tamanho: file.size,
    })
    if (ins.error) return `Falha ao registrar ${tipo}: ${ins.error.message}`
  }
  return null
}

export async function criarPeca(
  _prev: EstadoPeca,
  formData: FormData,
): Promise<EstadoPeca> {
  const sku = String(formData.get('sku') ?? '').trim()
  const part_number = String(formData.get('part_number') ?? '').trim()
  const descricao = String(formData.get('descricao') ?? '').trim()

  if (!sku || !part_number || !descricao) {
    return { erro: 'Preencha SKU, part number e descrição.' }
  }

  const supabase = await createClient()
  const { data: peca, error } = await supabase
    .from('pecas')
    .insert({ sku, part_number, descricao })
    .select('id')
    .single()
  if (error) return { erro: mapErro(error) }

  const erroAnexo = await enviarAnexos(
    supabase,
    peca.id,
    arquivosDe(formData, 'fotos'),
    arquivosDe(formData, 'documentos'),
  )
  if (erroAnexo) return { erro: erroAnexo }

  revalidatePath('/pecas')
  redirect('/pecas')
}
```

- [ ] **Step 2: `components/peca-form.tsx` (client — create e edit)**

```tsx
'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import type { EstadoPeca } from '@/app/pecas/actions'
import type { PecaDetalheData } from '@/lib/pecas'

type AcaoForm = (state: EstadoPeca, formData: FormData) => Promise<EstadoPeca>
const inicial: EstadoPeca = { erro: null }

export function PecaForm({
  action,
  titulo,
  peca,
}: {
  action: AcaoForm
  titulo: string
  peca?: PecaDetalheData
}) {
  const [state, formAction, pending] = useActionState(action, inicial)
  const [previews, setPreviews] = useState<string[]>([])
  const [docsNomes, setDocsNomes] = useState<string[]>([])
  const [removidos, setRemovidos] = useState<string[]>([])

  // Limpa object URLs ao trocar seleção / desmontar
  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u))
  }, [previews])

  const fotosExistentes = (peca?.fotos ?? []).filter((f) => !removidos.includes(f.id))
  const docsExistentes = (peca?.documentos ?? []).filter((d) => !removidos.includes(d.id))

  const inputCls =
    'w-full rounded-lg border border-steel-300 px-3 py-2 outline-none focus:border-brand-600 dark:bg-steel-900'

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-steel-800 dark:text-steel-100">{titulo}</h1>

      {state?.erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.erro}</p>
      )}

      <div className="space-y-1">
        <label htmlFor="sku" className="text-sm font-medium">SKU</label>
        <input id="sku" name="sku" required defaultValue={peca?.sku}
          className={`${inputCls} font-mono`} />
      </div>

      <div className="space-y-1">
        <label htmlFor="part_number" className="text-sm font-medium">Part number (fabricante)</label>
        <input id="part_number" name="part_number" required defaultValue={peca?.part_number}
          className={`${inputCls} font-mono`} />
      </div>

      <div className="space-y-1">
        <label htmlFor="descricao" className="text-sm font-medium">Descrição</label>
        <textarea id="descricao" name="descricao" required rows={3} defaultValue={peca?.descricao}
          className={inputCls} />
      </div>

      {fotosExistentes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Fotos atuais</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {fotosExistentes.map((f) => (
              <div key={f.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.nome ?? ''} className="h-24 w-full rounded-lg object-cover" />
                <button type="button" onClick={() => setRemovidos((r) => [...r, f.id])}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white">
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="fotos" className="text-sm font-medium">Adicionar fotos</label>
        <input id="fotos" name="fotos" type="file" multiple accept="image/*"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            setPreviews(files.map((f) => URL.createObjectURL(f)))
          }}
          className="block w-full text-sm" />
        {previews.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {previews.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={u} alt="" className="h-24 w-full rounded-lg object-cover" />
            ))}
          </div>
        )}
      </div>

      {docsExistentes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Documentos atuais</p>
          <ul className="space-y-1">
            {docsExistentes.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg border border-steel-200 px-3 py-2 text-sm dark:border-steel-700">
                <span>📄 {d.nome}</span>
                <button type="button" onClick={() => setRemovidos((r) => [...r, d.id])}
                  className="text-brand-700 hover:underline">
                  remover
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="documentos" className="text-sm font-medium">Adicionar documentos</label>
        <input id="documentos" name="documentos" type="file" multiple
          onChange={(e) => setDocsNomes(Array.from(e.target.files ?? []).map((f) => f.name))}
          className="block w-full text-sm" />
        {docsNomes.length > 0 && (
          <ul className="mt-2 text-xs text-steel-500">
            {docsNomes.map((n, i) => <li key={i}>📄 {n}</li>)}
          </ul>
        )}
      </div>

      {removidos.map((id) => (
        <input key={id} type="hidden" name="remover" value={id} />
      ))}

      <div className="flex gap-3">
        <button type="submit" disabled={pending}
          className="rounded-lg bg-brand-600 px-5 py-2 font-medium text-white transition hover:bg-brand-700 disabled:opacity-60">
          {pending ? 'Salvando...' : 'Salvar'}
        </button>
        <Link href="/pecas" className="rounded-lg border border-steel-300 px-5 py-2 font-medium text-steel-700 hover:bg-steel-100 dark:border-steel-600 dark:text-steel-200">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: `app/pecas/nova/page.tsx`**

```tsx
import { PecaForm } from '@/components/peca-form'
import { criarPeca } from '../actions'

export default function NovaPecaPage() {
  return <PecaForm action={criarPeca} titulo="Nova peça" />
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` → sem erros.
Run: `npm run dev`, logar, ir em `/pecas/nova`, preencher SKU/part number/descrição, escolher 2+ fotos (aparecem previews) e 1+ documento → Salvar → volta para `/pecas` com o card exibindo a capa e contadores 📷/📄. Testar SKU duplicado → mensagem "SKU já cadastrado.". Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add app/pecas/actions.ts components/peca-form.tsx app/pecas/nova
git commit -m "feat(pecas): cadastro com upload de fotos e documentos"
```

---

## Task 8: Detalhe da peça (modal + página cheia via parallel/intercepting routes)

**Files:**
- Create: `components/modal.tsx`, `components/galeria-fotos.tsx`, `components/botao-excluir.tsx`, `components/peca-detalhe.tsx`, `app/pecas/[id]/page.tsx`, `app/pecas/@modal/(.)[id]/page.tsx`
- Modify: `app/pecas/actions.ts` (adicionar `excluirPeca`)

**Interfaces:**
- Consumes: `buscarPeca`, `PecaDetalheData`, `AnexoComUrl`.
- Produces:
  - `Modal` (client) `{ children }`
  - `GaleriaFotos` (client) `{ fotos: AnexoComUrl[] }`
  - `BotaoExcluir` (client) `{ id: string }`
  - `PecaDetalhe` `{ peca: PecaDetalheData }`
  - `excluirPeca(id: string, _fd?: FormData): Promise<void>` em `app/pecas/actions.ts`

- [ ] **Step 1: adicionar `excluirPeca` ao final de `app/pecas/actions.ts`**

```ts
export async function excluirPeca(id: string, _formData?: FormData) {
  const supabase = await createClient()

  const { data: anexos } = await supabase
    .from('pecas_anexos')
    .select('tipo, path')
    .eq('peca_id', id)

  const fotos = (anexos ?? []).filter((a) => a.tipo === 'foto').map((a) => a.path)
  const docs = (anexos ?? []).filter((a) => a.tipo === 'documento').map((a) => a.path)

  if (fotos.length) await supabase.storage.from(BUCKET_FOTOS).remove(fotos)
  if (docs.length) await supabase.storage.from(BUCKET_DOCS).remove(docs)

  // Cascade remove as linhas de pecas_anexos
  const { error } = await supabase.from('pecas').delete().eq('id', id)
  if (error) console.error('Erro ao excluir peça:', error.message)

  revalidatePath('/pecas')
  redirect('/pecas')
}
```

- [ ] **Step 2: `components/modal.tsx` (client)**

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function Modal({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.back()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) router.back()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-steel-900">
        <div className="mb-2 flex justify-end">
          <button onClick={() => router.back()}
            className="grid h-8 w-8 place-items-center rounded-full text-steel-500 hover:bg-steel-100 dark:hover:bg-steel-800">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `components/galeria-fotos.tsx` (client — grade + lightbox)**

```tsx
'use client'

import { useState } from 'react'
import type { AnexoComUrl } from '@/lib/pecas'

export function GaleriaFotos({ fotos }: { fotos: AnexoComUrl[] }) {
  const [aberto, setAberto] = useState<number | null>(null)

  if (fotos.length === 0) {
    return <p className="text-sm text-steel-400">Sem fotos.</p>
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.map((f, i) => (
          <button key={f.id} onClick={() => setAberto(i)} className="overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={f.nome ?? 'foto'} className="h-24 w-full object-cover transition hover:scale-105" />
          </button>
        ))}
      </div>

      {aberto !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setAberto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotos[aberto].url} alt="" className="max-h-[85vh] max-w-full rounded-lg" />
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: `components/botao-excluir.tsx` (client — confirmação)**

```tsx
'use client'

import { useState } from 'react'
import { excluirPeca } from '@/app/pecas/actions'

export function BotaoExcluir({ id }: { id: string }) {
  const [confirmando, setConfirmando] = useState(false)

  if (!confirmando) {
    return (
      <button onClick={() => setConfirmando(true)}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
        Excluir
      </button>
    )
  }

  return (
    <form action={excluirPeca.bind(null, id)} className="inline-flex items-center gap-2">
      <span className="text-sm text-steel-600">Confirmar exclusão?</span>
      <button type="submit"
        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">
        Sim, excluir
      </button>
      <button type="button" onClick={() => setConfirmando(false)}
        className="rounded-lg border border-steel-300 px-3 py-2 text-sm">
        Cancelar
      </button>
    </form>
  )
}
```

- [ ] **Step 5: `components/peca-detalhe.tsx`**

```tsx
import Link from 'next/link'
import type { PecaDetalheData } from '@/lib/pecas'
import { GaleriaFotos } from './galeria-fotos'
import { BotaoExcluir } from './botao-excluir'

function formatarTamanho(bytes: number | null): string {
  if (!bytes) return ''
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

export function PecaDetalhe({ peca }: { peca: PecaDetalheData }) {
  return (
    <article className="space-y-6">
      <div>
        <p className="font-mono text-lg font-semibold text-brand-700">{peca.sku}</p>
        <p className="font-mono text-sm text-steel-500">{peca.part_number}</p>
        <p className="mt-2 text-steel-700 dark:text-steel-300">{peca.descricao}</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-steel-500">Fotos</h2>
        <GaleriaFotos fotos={peca.fotos} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-steel-500">Documentos</h2>
        {peca.documentos.length === 0 ? (
          <p className="text-sm text-steel-400">Sem documentos.</p>
        ) : (
          <ul className="space-y-1">
            {peca.documentos.map((d) => (
              <li key={d.id}>
                <a href={d.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg border border-steel-200 px-3 py-2 text-sm hover:bg-steel-50 dark:border-steel-700 dark:hover:bg-steel-800">
                  <span>📄 {d.nome}</span>
                  <span className="text-xs text-steel-400">{formatarTamanho(d.tamanho)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-3 border-t border-steel-200 pt-4 dark:border-steel-700">
        <Link href={`/pecas/${peca.id}/editar`}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Editar
        </Link>
        <BotaoExcluir id={peca.id} />
      </div>
    </article>
  )
}
```

- [ ] **Step 6: `app/pecas/[id]/page.tsx` (página cheia — acesso direto/refresh)**

```tsx
import { notFound } from 'next/navigation'
import { buscarPeca } from '@/lib/pecas'
import { PecaDetalhe } from '@/components/peca-detalhe'

export default async function PecaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const peca = await buscarPeca(id)
  if (!peca) notFound()

  return (
    <div className="rounded-2xl border border-steel-200 bg-white p-6 dark:border-steel-700 dark:bg-steel-800">
      <PecaDetalhe peca={peca} />
    </div>
  )
}
```

- [ ] **Step 7: `app/pecas/@modal/(.)[id]/page.tsx` (interceptado — modal)**

```tsx
import { notFound } from 'next/navigation'
import { buscarPeca } from '@/lib/pecas'
import { PecaDetalhe } from '@/components/peca-detalhe'
import { Modal } from '@/components/modal'

export default async function PecaModalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const peca = await buscarPeca(id)
  if (!peca) notFound()

  return (
    <Modal>
      <PecaDetalhe peca={peca} />
    </Modal>
  )
}
```

- [ ] **Step 8: Verificar**

Run: `npx tsc --noEmit` → sem erros.
Run: `npm run dev`, logar:
- Na lista, clicar num card → abre **modal** sobre a lista e a URL muda para `/pecas/<id>`. Fechar (×, Esc ou clique no fundo) → volta para `/pecas`.
- Abrir `/pecas/<id>` direto no navegador (nova aba/refresh) → mostra a **página cheia**.
- Clicar num documento → baixa/abre via URL assinada.
- Excluir com confirmação → volta para `/pecas` sem a peça; conferir no Supabase que as linhas e arquivos sumiram.
Ctrl+C.

- [ ] **Step 9: Commit**

```bash
git add app/pecas components
git commit -m "feat(pecas): detalhe em modal com URL (parallel/intercepting routes) e exclusão"
```

---

## Task 9: Edição de peça (update)

**Files:**
- Modify: `app/pecas/actions.ts` (adicionar `atualizarPeca`)
- Create: `app/pecas/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `createClient`, `enviarAnexos`, `arquivosDe`, `mapErro`, `BUCKET_FOTOS`/`BUCKET_DOCS`, `PecaForm`, `buscarPeca`.
- Produces: `atualizarPeca(id: string, prev: EstadoPeca, formData: FormData): Promise<EstadoPeca>`

- [ ] **Step 1: adicionar `atualizarPeca` ao `app/pecas/actions.ts`**

```ts
export async function atualizarPeca(
  id: string,
  _prev: EstadoPeca,
  formData: FormData,
): Promise<EstadoPeca> {
  const sku = String(formData.get('sku') ?? '').trim()
  const part_number = String(formData.get('part_number') ?? '').trim()
  const descricao = String(formData.get('descricao') ?? '').trim()

  if (!sku || !part_number || !descricao) {
    return { erro: 'Preencha SKU, part number e descrição.' }
  }

  const supabase = await createClient()

  const { error: erroUpdate } = await supabase
    .from('pecas')
    .update({ sku, part_number, descricao })
    .eq('id', id)
  if (erroUpdate) return { erro: mapErro(erroUpdate) }

  // Remoção de anexos marcados
  const removerIds = formData.getAll('remover').map((v) => String(v))
  if (removerIds.length) {
    const { data: aRem } = await supabase
      .from('pecas_anexos')
      .select('id, tipo, path')
      .in('id', removerIds)

    const fotos = (aRem ?? []).filter((a) => a.tipo === 'foto').map((a) => a.path)
    const docs = (aRem ?? []).filter((a) => a.tipo === 'documento').map((a) => a.path)
    if (fotos.length) await supabase.storage.from(BUCKET_FOTOS).remove(fotos)
    if (docs.length) await supabase.storage.from(BUCKET_DOCS).remove(docs)
    await supabase.from('pecas_anexos').delete().in('id', removerIds)
  }

  // Novos anexos
  const erroAnexo = await enviarAnexos(
    supabase,
    id,
    arquivosDe(formData, 'fotos'),
    arquivosDe(formData, 'documentos'),
  )
  if (erroAnexo) return { erro: erroAnexo }

  revalidatePath('/pecas')
  revalidatePath(`/pecas/${id}`)
  redirect(`/pecas/${id}`)
}
```

- [ ] **Step 2: `app/pecas/[id]/editar/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { buscarPeca } from '@/lib/pecas'
import { PecaForm } from '@/components/peca-form'
import { atualizarPeca } from '../../actions'

export default async function EditarPecaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const peca = await buscarPeca(id)
  if (!peca) notFound()

  const action = atualizarPeca.bind(null, id)
  return <PecaForm action={action} titulo="Editar peça" peca={peca} />
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` → sem erros.
Run: `npm run dev`, logar, abrir uma peça → Editar. Alterar a descrição, remover uma foto existente (× na miniatura), adicionar um novo documento → Salvar → redireciona ao detalhe com as mudanças refletidas. Conferir no Supabase que o arquivo removido saiu do bucket. Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add app/pecas/actions.ts app/pecas/[id]/editar
git commit -m "feat(pecas): edição de peça (dados e anexos)"
```

---

## Task 10: Polimento visual (tema manutenção)

**Files:**
- Modify: `app/layout.tsx` (lang pt-BR, fontes), componentes conforme necessário para refinar espaçamento, estados hover/focus, responsividade e detalhes de blueprint no header.

**Interfaces:**
- Sem mudanças de assinatura. Apenas refinamento visual.

- [ ] **Step 1: Invocar a skill de design de frontend**

Use `frontend-design` para guiar o refinamento visual: aplicar a paleta análoga (âmbar→laranja→vermelho-telha) com neutros de aço, ícones de oficina (engrenagem/chave), textura sutil de grade (blueprint) no header, tipografia com números em monoespaçada, e consistência de cards/botões em light/dark.

- [ ] **Step 2: `app/layout.tsx` — idioma e metadados**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Catálogo de Peças',
  description: 'Cadastro e consulta de peças de manutenção',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Refinar componentes**

Aplicar os ajustes visuais sugeridos pela skill nos componentes (`header`, `peca-card`, `peca-form`, `peca-detalhe`, `login-form`, `modal`), mantendo as assinaturas e a lógica. Garantir foco visível, contraste adequado e responsividade (grade 1→2→3 colunas).

- [ ] **Step 4: Verificar (build de produção + revisão visual)**

Run: `npm run build` → build sem erros.
Run: `npm run dev` e percorrer o fluxo completo (login → lista → nova → detalhe modal/página → editar → excluir → logout) conferindo o visual em telas larga e estreita, e em modo claro/escuro. Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "style: polimento visual do tema manutenção"
```

---

## Verificação final (manual, conforme spec)

Percorrer o roteiro da seção 10 da spec:

1. Login com usuário do painel.
2. Cadastrar peça com múltiplas fotos e documentos.
3. Ver na lista e abrir o detalhe (modal e via URL direta).
4. Baixar um documento (URL assinada).
5. Editar (trocar/remover fotos e documentos).
6. Excluir peça (linhas em `pecas_anexos` somem por cascade; arquivos removidos dos buckets).
7. Logout e conferir que rotas protegidas redirecionam para `/login`.

---

## Cobertura da spec (self-review)

- Login e-mail/senha, sem sign up, logout → Task 4 + middleware (Task 3).
- Usuários criados no painel → Task 2 Step 3.
- Catálogo compartilhado (RLS authenticated) → Task 2.
- Tabelas `pecas` + `pecas_anexos` (N fotos/documentos) → Task 2, Task 5.
- Buckets público/privado + URL assinada → Task 2 (buckets/policies), Task 5 (`buscarPeca` assina docs).
- Upload múltiplo de fotos e documentos + remoção → Task 7 (create), Task 9 (edit).
- Lista com capa + contadores → Task 6.
- Detalhe como modal com URL (parallel + intercepting) e página cheia → Task 8.
- CRUD completo (criar/ver/editar/excluir) → Tasks 7, 8, 9.
- Tema manutenção (paleta análoga, mono para SKU/part number) → Task 1 (tokens), Task 10 (polimento).
- Erros/validação (SKU único, login inválido) → `mapErro` (Task 4), validações nas actions (Tasks 7, 9).
- Verificação manual + tsc/build → passos de verificação de cada task.
