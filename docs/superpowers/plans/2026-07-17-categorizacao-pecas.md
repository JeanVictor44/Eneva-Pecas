# Categorização de peças — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir criar OU selecionar uma categoria (única, opcional) por peça no cadastro/edição, exibi-la no card/detalhe e filtrar a listagem por categoria.

**Architecture:** Nova tabela `categorias` + coluna `pecas.categoria_id` (FK nullable). Um único campo `<input list>` + `<datalist>` no formulário faz "criar-ou-selecionar"; o servidor resolve o nome para um id (busca case-insensitive → cria se não existir). Card/detalhe mostram um badge; a listagem ganha chips de filtro por categoria combinados com a busca de texto.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `useActionState`), React 19, Supabase (`@supabase/ssr`), Tailwind v4, base-ui, lucide-react.

## Global Constraints

- **AGENTS.md:** "This is NOT the Next.js you know" — os padrões já usados no repo (`useActionState`, `<form action={formAction}>`, `formData.get/getAll`, Server Actions) são a referência; siga-os.
- **Sem framework de testes.** Verificação por tarefa: `npx tsc --noEmit` e `npm run lint`. Gate final: `npm run build` verde + smoke test manual. Não introduzir Jest/Vitest.
- **A mudança de tipo é ADITIVA** (`PecaLista`/`PecaDetalheData` ganham `categoria`, nada é removido) — cada tarefa deve terminar com `npx tsc --noEmit` VERDE (zero erros). Se aparecer erro, corrija antes de reportar.
- **Idioma:** identificadores e textos em pt-BR, seguindo o código existente.
- **Commits são opcionais** — o usuário prefere não commitar docs de planejamento; commite o código de implementação normalmente na branch de feature.
- **Migração de banco é manual:** o SQL é aplicado pelo usuário no Supabase; não há conexão de banco aqui.
- **Tipo canônico** (Task 2, usado nas demais):
  ```ts
  export type Categoria = { id: string; nome: string }
  ```
- **Campo do formulário:** o form envia um único campo de texto `name="categoria"` (o nome). Vazio ⇒ sem categoria (opcional).
- **Unicidade:** nome de categoria é único case-insensitive (índice em `lower(nome)`).

---

## File Structure

- `docs/supabase/setup.sql` — tabela `categorias` + `pecas.categoria_id` + RLS + migração idempotente. (Task 1)
- `lib/tipos.ts` — tipo `Categoria`. (Task 2)
- `lib/pecas.ts` — `categoria` em `PecaLista`/`PecaDetalheData`; joins; `listarCategorias`. (Task 2)
- `app/pecas/actions.ts` — `resolverCategoria` + `categoria_id` em criar/atualizar. (Task 3)
- `app/pecas/page.tsx` + `components/pecas-view.tsx` + `components/peca-form.tsx` — fio do datalist. (Task 4)
- `components/peca-card.tsx` + `components/peca-detalhe.tsx` — badge da categoria. (Task 5)
- `components/pecas-view.tsx` — chips de filtro + filtro combinado. (Task 6)

---

## Task 1: Banco — tabela `categorias` + `pecas.categoria_id`

**Files:**
- Modify: `docs/supabase/setup.sql`

**Interfaces:**
- Produces: `public.categorias(id, nome, created_at, created_by)` com índice único `lower(nome)`; `public.pecas.categoria_id uuid null → categorias(id) on delete set null`; RLS + 4 policies.

- [ ] **Step 1: Criar a tabela `categorias` ANTES da tabela `pecas`** (a FK de `pecas` depende dela)

Logo após o `create extension ... pgcrypto;` e ANTES de `create table if not exists public.pecas`, inserir:

```sql
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
```

- [ ] **Step 2: Adicionar `categoria_id` na definição de `public.pecas`**

Na tabela `public.pecas`, acrescentar a coluna (após `descricao`):

```sql
create table if not exists public.pecas (
  id          uuid primary key default gen_random_uuid(),
  descricao   text not null,
  categoria_id uuid references public.categorias(id) on delete set null,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid()
);
```

- [ ] **Step 3: RLS + policies de `categorias`** (junto ao bloco `-- RLS`, seguindo o padrão das outras tabelas)

```sql
alter table public.categorias enable row level security;

create policy "categorias_select_auth" on public.categorias for select to authenticated using (true);
create policy "categorias_insert_auth" on public.categorias for insert to authenticated with check (true);
create policy "categorias_update_auth" on public.categorias for update to authenticated using (true) with check (true);
create policy "categorias_delete_auth" on public.categorias for delete to authenticated using (true);
```

- [ ] **Step 4: Bloco de migração idempotente ao final do arquivo** (seguro em banco existente E novo; o usuário roda SÓ este bloco no banco já existente)

```sql
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
```

- [ ] **Step 5: Verificar (revisão manual)**

Ler o arquivo e confirmar: `categorias` existe antes de `pecas`; `pecas` tem `categoria_id`; índice único `lower(nome)`; RLS + 4 policies; bloco de migração idempotente ao final. Sem comando automatizado (o usuário aplica no Supabase).

- [ ] **Step 6 (opcional): Commit**

```bash
git add docs/supabase/setup.sql
git commit -m "feat(db): tabela categorias + pecas.categoria_id"
```

---

## Task 2: Tipos + camada de dados

**Files:**
- Modify: `lib/tipos.ts`
- Modify: `lib/pecas.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: `Categoria = { id, nome }`; `PecaLista`/`PecaDetalheData` com `categoria: Categoria | null`; `listarCategorias(): Promise<Categoria[]>`.

- [ ] **Step 1: `lib/tipos.ts` — adicionar o tipo `Categoria`** (aditivo)

```ts
export type Categoria = {
  id: string
  nome: string
}
```

- [ ] **Step 2: `lib/pecas.ts` — importar `Categoria` e adicionar `categoria` aos dois tipos**

Trocar o import de tipos:

```ts
import type { Anexo, Trinca, Categoria } from '@/lib/tipos'
```

Adicionar `categoria: Categoria | null` em `PecaLista` (após `referencias`) e em `PecaDetalheData` (após `referencias`):

```ts
export type PecaLista = {
  id: string
  descricao: string
  referencias: Trinca[]
  categoria: Categoria | null
  capaUrl: string | null
  qtdFotos: number
  qtdDocs: number
}
```
```ts
export type PecaDetalheData = {
  id: string
  descricao: string
  referencias: Trinca[]
  categoria: Categoria | null
  created_at: string
  fotos: AnexoComUrl[]
  documentos: AnexoComUrl[]
}
```

- [ ] **Step 3: `listarPecas` — join da categoria + map**

No `.select(...)` de `listarPecas`, acrescentar `categoria:categorias(id, nome)`:

```ts
    .select(
      'id, descricao, categoria:categorias(id, nome), referencias:pecas_referencias(sku, part_number, fabricante, ordem), anexos:pecas_anexos(tipo, path, created_at)',
    )
```

No `return` do map, adicionar `categoria` (o join many-to-one retorna objeto ou null):

```ts
    return {
      id: p.id,
      descricao: p.descricao,
      referencias,
      categoria: (p.categoria ?? null) as Categoria | null,
      capaUrl,
      qtdFotos: fotos.length,
      qtdDocs: docs.length,
    }
```

- [ ] **Step 4: `buscarPeca` — join da categoria + retorno**

No `.select(...)` de `buscarPeca`, acrescentar `categoria:categorias(id, nome)`:

```ts
    .select(
      'id, descricao, created_at, categoria:categorias(id, nome), referencias:pecas_referencias(sku, part_number, fabricante, ordem), anexos:pecas_anexos(*)',
    )
```

No `return`, adicionar `categoria`:

```ts
  return {
    id: data.id,
    descricao: data.descricao,
    referencias,
    categoria: (data.categoria ?? null) as Categoria | null,
    created_at: data.created_at,
    fotos,
    documentos,
  }
```

- [ ] **Step 5: `listarCategorias` — nova função ao final de `lib/pecas.ts`**

```ts
export async function listarCategorias(): Promise<Categoria[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nome')
    .order('nome', { ascending: true })
  if (error) throw error
  return (data ?? []) as Categoria[]
}
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit`
Expected: PASS (zero erros — mudança aditiva).
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 7 (opcional): Commit**

```bash
git add lib/tipos.ts lib/pecas.ts
git commit -m "feat(pecas): categoria na camada de dados + listarCategorias"
```

---

## Task 3: Server actions — resolver categoria

**Files:**
- Modify: `app/pecas/actions.ts`

**Interfaces:**
- Consumes: tabela `categorias` (Task 1). Usa `SupabaseClient` e `mapErro` (já importados no arquivo).
- Produces: `criarPeca`/`atualizarPeca` gravam `categoria_id` resolvido do campo `categoria` do form.

- [ ] **Step 1: Adicionar o helper `resolverCategoria`** (após `trincasValidas`)

```ts
async function resolverCategoria(
  supabase: SupabaseClient,
  nomeBruto: string,
): Promise<{ id: string | null; erro: string | null }> {
  const nome = nomeBruto.trim()
  if (!nome) return { id: null, erro: null }

  // 1) Busca case-insensitive por categoria existente.
  const { data: existente, error: erroBusca } = await supabase
    .from('categorias')
    .select('id')
    .ilike('nome', nome)
    .maybeSingle()
  if (erroBusca) return { id: null, erro: mapErro(erroBusca) }
  if (existente) return { id: existente.id, erro: null }

  // 2) Não existe: cria. Em corrida (23505 no índice lower(nome)), re-seleciona.
  const { data: nova, error: erroInsert } = await supabase
    .from('categorias')
    .insert({ nome })
    .select('id')
    .single()
  if (!erroInsert) return { id: nova.id, erro: null }

  const { data: reencontrada } = await supabase
    .from('categorias')
    .select('id')
    .ilike('nome', nome)
    .maybeSingle()
  if (reencontrada) return { id: reencontrada.id, erro: null }
  return { id: null, erro: mapErro(erroInsert) }
}
```

- [ ] **Step 2: `criarPeca` — resolver categoria e gravar `categoria_id`**

Logo após `const supabase = await createClient()` e ANTES do insert da peça, inserir:

```ts
  const cat = await resolverCategoria(supabase, String(formData.get('categoria') ?? ''))
  if (cat.erro) return { erro: cat.erro, ok: false }
```

E trocar o insert da peça para incluir `categoria_id`:

```ts
  const { data: peca, error } = await supabase
    .from('pecas')
    .insert({ descricao, categoria_id: cat.id })
    .select('id')
    .single()
```

- [ ] **Step 3: `atualizarPeca` — resolver categoria e gravar `categoria_id`**

Logo após `const supabase = await createClient()` e ANTES do update da peça, inserir:

```ts
  const cat = await resolverCategoria(supabase, String(formData.get('categoria') ?? ''))
  if (cat.erro) return { erro: cat.erro, ok: false }
```

E trocar o update da peça para incluir `categoria_id`:

```ts
  const { error: erroUpdate } = await supabase
    .from('pecas')
    .update({ descricao, categoria_id: cat.id })
    .eq('id', id)
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5 (opcional): Commit**

```bash
git add app/pecas/actions.ts
git commit -m "feat(pecas): resolve categoria (criar-ou-selecionar) nas actions"
```

---

## Task 4: Fio do datalist (página → view → formulário)

**Files:**
- Modify: `app/pecas/page.tsx`
- Modify: `components/pecas-view.tsx`
- Modify: `components/peca-form.tsx`

**Interfaces:**
- Consumes: `listarCategorias` (Task 2), `Categoria` (Task 2).
- Produces: `PecasView` recebe prop `categorias: Categoria[]` e a repassa às duas instâncias de `PecaForm`; `PecaForm` recebe `categorias` e renderiza o campo `categoria` com `<datalist>`.

> Estas três mudanças são acopladas (a prop nova de `PecaForm` quebra `pecas-view` até ser repassada) — por isso ficam na mesma task, terminando verde.

- [ ] **Step 1: `app/pecas/page.tsx` — buscar categorias e passar para a view**

```tsx
import { listarPecas, listarCategorias } from '@/lib/pecas'
import { PecasView } from '@/components/pecas-view'

export default async function PecasPage() {
  const [pecas, categorias] = await Promise.all([listarPecas(), listarCategorias()])
  return <PecasView pecas={pecas} categorias={categorias} />
}
```

- [ ] **Step 2: `components/peca-form.tsx` — prop `categorias` + campo com datalist**

Adicionar o import do tipo:

```ts
import type { Categoria } from '@/lib/tipos'
```

Adicionar `categorias` à assinatura de props:

```tsx
export function PecaForm({
  action,
  peca,
  categorias,
  onSuccess,
  submitLabel = 'Salvar',
}: {
  action: AcaoForm
  peca?: PecaDetalheData
  categorias: Categoria[]
  onSuccess: () => void
  submitLabel?: string
}) {
```

Inserir o campo de categoria logo após o banner de erro (`{state.erro && (...)}`) e ANTES do bloco `<div className="space-y-3">` das Referências:

```tsx
      <div className="space-y-1.5">
        <Label htmlFor="categoria">Categoria</Label>
        <Input
          id="categoria"
          name="categoria"
          list="categorias-list"
          defaultValue={peca?.categoria?.nome ?? ''}
          placeholder="Selecione ou crie…"
          autoComplete="off"
        />
        <datalist id="categorias-list">
          {categorias.map((c) => (
            <option key={c.id} value={c.nome} />
          ))}
        </datalist>
      </div>
```

- [ ] **Step 3: `components/pecas-view.tsx` — receber `categorias` e repassar ao form**

Adicionar o import do tipo:

```ts
import type { Categoria } from '@/lib/tipos'
```

Trocar a assinatura para receber `categorias`:

```tsx
export function PecasView({
  pecas,
  categorias,
}: {
  pecas: PecaLista[]
  categorias: Categoria[]
}) {
```

Passar `categorias={categorias}` nas DUAS instâncias de `<PecaForm>` (a de "Nova peça" e a de "Editar"):

```tsx
          <PecaForm
            action={criarPeca}
            categorias={categorias}
            onSuccess={() => aoSucesso('Peça cadastrada.')}
            submitLabel="Cadastrar"
          />
```
```tsx
            <PecaForm
              action={atualizarPeca.bind(null, pecaSel.id)}
              peca={pecaSel}
              categorias={categorias}
              onSuccess={() => aoSucesso('Alterações salvas.')}
              submitLabel="Salvar"
            />
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: PASS (as três mudanças juntas deixam tudo consistente).
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5 (opcional): Commit**

```bash
git add app/pecas/page.tsx components/pecas-view.tsx components/peca-form.tsx
git commit -m "feat(form): campo categoria com datalist (criar-ou-selecionar)"
```

---

## Task 5: Exibição — badge da categoria no card e no detalhe

**Files:**
- Modify: `components/peca-card.tsx`
- Modify: `components/peca-detalhe.tsx`

**Interfaces:**
- Consumes: `PecaLista.categoria` / `PecaDetalheData.categoria` (Task 2).

- [ ] **Step 1: `components/peca-card.tsx` — badge no topo do corpo**

Adicionar o import:

```ts
import { Badge } from '@/components/ui/badge'
```

Dentro de `<div className="flex flex-1 flex-col gap-1 p-4">`, inserir o badge ANTES do `<div className="space-y-1">` das referências:

```tsx
      <div className="flex flex-1 flex-col gap-1 p-4">
        {peca.categoria && (
          <Badge variant="secondary" className="mb-1">
            {peca.categoria.nome}
          </Badge>
        )}
        <div className="space-y-1">
```

(o restante do corpo permanece igual.)

- [ ] **Step 2: `components/peca-detalhe.tsx` — badge no cabeçalho**

Adicionar o import:

```ts
import { Badge } from '@/components/ui/badge'
```

Dentro de `<DialogHeader>`, após o `<DialogTitle className="sr-only">…</DialogTitle>` e ANTES do `<div className="space-y-3">` das referências, inserir:

```tsx
        {peca.categoria && (
          <Badge variant="secondary" className="mb-1 w-fit">
            {peca.categoria.nome}
          </Badge>
        )}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4 (opcional): Commit**

```bash
git add components/peca-card.tsx components/peca-detalhe.tsx
git commit -m "feat(ui): badge de categoria no card e no detalhe"
```

---

## Task 6: Filtro por categoria na listagem + verificação final

**Files:**
- Modify: `components/pecas-view.tsx`

**Interfaces:**
- Consumes: `PecaLista.categoria` (Task 2).

- [ ] **Step 1: Import de `cn`**

Adicionar ao topo (após os imports de UI):

```ts
import { cn } from '@/lib/utils'
```

- [ ] **Step 2: Estado do filtro + categorias presentes** (junto aos outros `useState`)

```ts
  const [categoriaSel, setCategoriaSel] = useState<string | null>(null)

  const categoriasPresentes = useMemo(() => {
    const mapa = new Map<string, Categoria>()
    for (const p of pecas) if (p.categoria) mapa.set(p.categoria.id, p.categoria)
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome))
  }, [pecas])
```

- [ ] **Step 3: Substituir o `pecasFiltradas` para combinar categoria + texto**

```ts
  const pecasFiltradas = useMemo(() => {
    const q = normalizar(busca.trim())
    return pecas.filter((p) => {
      if (categoriaSel && p.categoria?.id !== categoriaSel) return false
      if (!q) return true
      return (
        normalizar(p.descricao).includes(q) ||
        (p.categoria ? normalizar(p.categoria.nome).includes(q) : false) ||
        p.referencias.some(
          (r) =>
            normalizar(r.sku).includes(q) ||
            normalizar(r.part_number).includes(q) ||
            normalizar(r.fabricante).includes(q),
        )
      )
    })
  }, [pecas, busca, categoriaSel])
```

- [ ] **Step 4: Contagem do cabeçalho considera o filtro**

Substituir o parágrafo de contagem (o `<p className="mt-1 text-sm text-muted-foreground">…</p>`) por:

```tsx
          <p className="mt-1 text-sm text-muted-foreground">
            {pecas.length === 0
              ? 'Nenhuma peça cadastrada.'
              : busca.trim() || categoriaSel
                ? `${pecasFiltradas.length} de ${pecas.length} ${pecas.length === 1 ? 'peça' : 'peças'}.`
                : `${pecas.length} ${pecas.length === 1 ? 'peça cadastrada' : 'peças cadastradas'}.`}
          </p>
```

- [ ] **Step 5: Chips de filtro acima da busca**

Dentro do ramo `pecas.length > 0`, ANTES do `<div className="relative mb-6">` da busca, inserir:

```tsx
          {categoriasPresentes.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoriaSel(null)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  categoriaSel === null
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-foreground hover:bg-muted',
                )}
              >
                Todas
              </button>
              {categoriasPresentes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoriaSel(c.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    categoriaSel === c.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-foreground hover:bg-muted',
                  )}
                >
                  {c.nome}
                </button>
              ))}
            </div>
          )}
```

- [ ] **Step 6: Mensagem de "nenhuma peça" genérica** (funciona com filtro de categoria e/ou busca)

Substituir o parágrafo dentro do bloco `pecasFiltradas.length === 0`:

```tsx
              <p className="text-sm text-muted-foreground">
                {busca.trim()
                  ? `Nenhuma peça encontrada para “${busca}”.`
                  : 'Nenhuma peça encontrada com esse filtro.'}
              </p>
```

- [ ] **Step 7: Verificação de tipos + lint (gate)**

Run: `npx tsc --noEmit`
Expected: PASS — zero erros.
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 8: Build (gate final)**

Run: `npm run build`
Expected: build conclui sem erros (o aviso pré-existente `middleware`→`proxy` é esperado e não relacionado).

- [ ] **Step 9: Smoke test manual** (`npm run dev`, aplicar antes o bloco de migração da Task 1 no Supabase)

Em `/pecas`:
1. **Nova peça** → no campo Categoria, digitar um nome novo (ex.: "Rolamentos") → cadastrar → toast de sucesso; o card mostra o badge "Rolamentos".
2. **Nova peça** de novo → clicar/focar o campo Categoria e escolher "Rolamentos" na sugestão do datalist → cadastrar → reutiliza a mesma categoria (não duplica).
3. **Editar** uma peça → trocar a categoria por outra (nova ou existente) → salvar → badge atualiza.
4. **Editar** → apagar o texto da categoria → salvar → peça fica "sem categoria" (sem badge).
5. **Filtro:** chips "Todas" + categorias presentes aparecem acima da busca; clicar numa categoria filtra; combinar com busca por texto (ambos aplicam).
6. Digitar a mesma categoria com caixa diferente ("rolamentos") ao cadastrar → reutiliza a existente (unicidade case-insensitive), não cria duplicata.

- [ ] **Step 10 (opcional): Commit**

```bash
git add components/pecas-view.tsx
git commit -m "feat(busca): filtro por categoria na listagem"
```

---

## Self-Review (cobertura do spec)

- **Tabela `categorias` + índice único `lower(nome)` + RLS/policies** → Task 1. ✓
- **`pecas.categoria_id` nullable + migração idempotente** → Task 1. ✓
- **Tipo `Categoria`** → Task 2. ✓
- **`categoria` em `PecaLista`/`PecaDetalheData` + joins + `listarCategorias`** → Task 2. ✓
- **`resolverCategoria` (busca case-insensitive → cria; re-select em corrida)** → Task 3. ✓
- **`categoria_id` no criar e no atualizar** → Task 3. ✓
- **Campo único `categoria` com `<datalist>` (criar-ou-selecionar)** → Task 4. ✓
- **`categorias` da página → view → form** → Task 4. ✓
- **Badge no card e no detalhe** → Task 5. ✓
- **Chips de filtro (derivados das categorias presentes) + filtro combinado com a busca** → Task 6. ✓
- **Categoria opcional (campo sem `required`; vazio ⇒ null)** → Tasks 3 e 4. ✓
- **Fora de escopo (gerenciar categorias, N:N, aninhadas, filtro server-side)** — não implementado. ✓
