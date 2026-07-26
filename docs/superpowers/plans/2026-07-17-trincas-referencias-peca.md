# Trincas de referência por peça — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cadastrar/editar uma peça com uma **lista de trincas** `fabricante + SKU + part number` (estado em array), substituindo os campos únicos `sku`/`part_number` de hoje.

**Architecture:** Nova tabela normalizada `pecas_referencias` (N por peça, no padrão de `pecas_anexos`). A tabela `pecas` perde `sku`/`part_number`. Formulário mantém as trincas em estado React (`Trinca[]`) e as envia como três listas paralelas no `FormData`; as server actions "zipam" por índice. Card/detalhe/busca passam a operar sobre a lista de trincas.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `useActionState`), React 19, Supabase (`@supabase/ssr`), Tailwind v4, base-ui Dialog, lucide-react.

## Global Constraints

- **AGENTS.md:** "This is NOT the Next.js you know" — antes de escrever código de Server Action/form, confira o guia relevante em `node_modules/next/dist/docs/`. Os padrões já usados no repo (`useActionState`, `<form action={formAction}>`, `formData.getAll`) são a referência — **siga-os**.
- **Sem framework de testes.** Verificação por tarefa: `npx tsc --noEmit` (tipos) e/ou `npm run lint`. Gate final: `npm run build` verde + smoke test manual. Não introduzir Jest/Vitest (fora de escopo).
- **Idioma:** identificadores e mensagens em pt-BR, seguindo o código existente.
- **Commits são opcionais** — o usuário indicou preferir não commitar por enquanto. Os passos "Commit" abaixo podem ser agrupados ou pulados.
- **Migração de banco é manual:** o SQL é aplicado pelo usuário no Supabase (SQL Editor). O agente não tem conexão com o banco.
- **Tipo canônico da trinca** (definido na Task 2, usado em todas as demais):
  ```ts
  export type Trinca = { sku: string; part_number: string; fabricante: string }
  ```
- **Acoplamento de tipos conhecido:** a Task 4 muda o formato de `PecaLista`/`PecaDetalheData`, o que quebra o `tsc` em `peca-card`, `peca-detalhe`, `pecas-view` e `peca-form` até serem corrigidos nas Tasks 5–7. Entre a Task 4 e a Task 7, `npx tsc --noEmit` reporta erros **apenas** nesses arquivos ainda não tratados — isso é esperado. `npm run lint` continua verde (o ESLint do projeto não é type-aware).

---

## File Structure

- `docs/supabase/setup.sql` — schema final (novo estado) + bloco de migração. (Task 1)
- `lib/tipos.ts` — tipos `Trinca` e `Referencia` (aditivo). (Task 2)
- `app/pecas/actions.ts` — parsing/validação de trincas; `criarPeca`/`atualizarPeca`. (Task 3)
- `lib/pecas.ts` — `PecaLista`/`PecaDetalheData` com `referencias`; queries. (Task 4)
- `components/peca-form.tsx` — estado em array + UI de adicionar/remover trinca. (Task 5)
- `components/peca-card.tsx` — lista todas as trincas. (Task 6)
- `components/peca-detalhe.tsx` — cabeçalho lista todas as trincas. (Task 6)
- `components/pecas-view.tsx` — busca sobre trincas + textos. (Task 7)

---

## Task 1: Banco de dados — tabela `pecas_referencias` + migração

**Files:**
- Modify: `docs/supabase/setup.sql`

**Interfaces:**
- Produces: tabela `public.pecas_referencias(id, peca_id, sku unique, part_number, fabricante, ordem, created_at, created_by)`; `pecas` sem `sku`/`part_number`.

- [ ] **Step 1: Atualizar `docs/supabase/setup.sql` — schema final da tabela `pecas`**

Substituir a definição atual de `public.pecas` (remover `sku` e `part_number`):

```sql
-- Tabela de peças
create table if not exists public.pecas (
  id          uuid primary key default gen_random_uuid(),
  descricao   text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid()
);
```

- [ ] **Step 2: Adicionar a tabela `pecas_referencias` (logo após a criação de `pecas`, antes de `pecas_anexos`)**

```sql
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
```

- [ ] **Step 3: Adicionar RLS + policies da nova tabela (junto ao bloco `-- RLS`)**

```sql
alter table public.pecas_referencias enable row level security;

create policy "referencias_select_auth" on public.pecas_referencias for select to authenticated using (true);
create policy "referencias_insert_auth" on public.pecas_referencias for insert to authenticated with check (true);
create policy "referencias_update_auth" on public.pecas_referencias for update to authenticated using (true) with check (true);
create policy "referencias_delete_auth" on public.pecas_referencias for delete to authenticated using (true);
```

- [ ] **Step 4: Adicionar bloco de migração (para bancos já existentes) ao final do arquivo**

```sql
-- ============================================================
-- MIGRAÇÃO (aplicar UMA vez em bancos que já tinham sku/part_number em pecas).
-- Pré-requisito: a tabela pecas_referencias acima já foi criada.
-- ============================================================
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
```

- [ ] **Step 5: Verificar (revisão manual)**

Ler o arquivo inteiro e confirmar: `pecas` sem `sku`/`part_number`; `pecas_referencias` com `unique(sku)`, índice, RLS e 4 policies; bloco de migração ao final. Não há comando automatizado — o usuário aplicará o SQL no Supabase.

- [ ] **Step 6 (opcional): Commit**

```bash
git add docs/supabase/setup.sql
git commit -m "feat(db): tabela pecas_referencias (trincas) + migração"
```

---

## Task 2: Tipos `Trinca` e `Referencia`

**Files:**
- Modify: `lib/tipos.ts`

**Interfaces:**
- Produces: `Trinca = { sku, part_number, fabricante }`; `Referencia = Trinca & { id, peca_id, ordem, created_at }`.

- [ ] **Step 1: Acrescentar os tipos ao final de `lib/tipos.ts`** (aditivo — não remove nada)

```ts
// Uma trinca de identificação: mesma forma no formulário e na exibição.
export type Trinca = {
  sku: string
  part_number: string
  fabricante: string
}

// Linha persistida em pecas_referencias.
export type Referencia = Trinca & {
  id: string
  peca_id: string
  ordem: number
  created_at: string
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: PASS (nenhum erro novo — mudança é puramente aditiva).

- [ ] **Step 3 (opcional): Commit**

```bash
git add lib/tipos.ts
git commit -m "feat(tipos): tipos Trinca e Referencia"
```

---

## Task 3: Server actions — parsing/validação de trincas

**Files:**
- Modify: `app/pecas/actions.ts`

**Interfaces:**
- Consumes: `Trinca` (Task 2).
- Produces: `criarPeca`/`atualizarPeca` que leem `descricao` + trincas do `FormData` e persistem em `pecas`/`pecas_referencias`.

- [ ] **Step 1: Importar `Trinca` no topo de `app/pecas/actions.ts`**

Adicionar ao import existente de `@/lib/pecas`/tipos. Como `Trinca` está em `@/lib/tipos`:

```ts
import type { Trinca } from '@/lib/tipos'
```

- [ ] **Step 2: Adicionar helpers de parsing/validação (após `arquivosDe`)**

```ts
function trincasDe(formData: FormData): Trinca[] {
  const skus = formData.getAll('trinca_sku').map((v) => String(v).trim())
  const pns = formData.getAll('trinca_part_number').map((v) => String(v).trim())
  const fabs = formData.getAll('trinca_fabricante').map((v) => String(v).trim())
  return skus.map((sku, i) => ({
    sku,
    part_number: pns[i] ?? '',
    fabricante: fabs[i] ?? '',
  }))
}

function trincasValidas(trincas: Trinca[]): boolean {
  return (
    trincas.length > 0 &&
    trincas.every((t) => t.sku && t.part_number && t.fabricante)
  )
}
```

- [ ] **Step 3: Reescrever `criarPeca`**

```ts
export async function criarPeca(
  _prev: EstadoPeca,
  formData: FormData,
): Promise<EstadoPeca> {
  const descricao = String(formData.get('descricao') ?? '').trim()
  const trincas = trincasDe(formData)

  if (!descricao) return { erro: 'Preencha a descrição.', ok: false }
  if (!trincasValidas(trincas)) {
    return { erro: 'Cada trinca precisa de SKU, part number e fabricante.', ok: false }
  }

  const supabase = await createClient()
  const { data: peca, error } = await supabase
    .from('pecas')
    .insert({ descricao })
    .select('id')
    .single()
  if (error) return { erro: mapErro(error), ok: false }

  const { error: erroRef } = await supabase
    .from('pecas_referencias')
    .insert(trincas.map((t, i) => ({ peca_id: peca.id, ...t, ordem: i })))
  if (erroRef) {
    await supabase.from('pecas').delete().eq('id', peca.id)
    return { erro: mapErro(erroRef), ok: false }
  }

  const erroAnexo = await enviarAnexos(
    supabase,
    peca.id,
    arquivosDe(formData, 'fotos'),
    arquivosDe(formData, 'documentos'),
  )
  if (erroAnexo) {
    const { error: erroLimpeza } = await supabase.from('pecas').delete().eq('id', peca.id)
    if (erroLimpeza) {
      console.error('Falha ao remover peça órfã:', peca.id, erroLimpeza.message)
    }
    return { erro: erroAnexo, ok: false }
  }

  revalidatePath('/pecas')
  return { erro: null, ok: true }
}
```

- [ ] **Step 4: Reescrever `atualizarPeca`** (mantém a lógica de anexos existente; troca a parte de sku/part_number por descricao + replace das trincas)

```ts
export async function atualizarPeca(
  id: string,
  _prev: EstadoPeca,
  formData: FormData,
): Promise<EstadoPeca> {
  const descricao = String(formData.get('descricao') ?? '').trim()
  const trincas = trincasDe(formData)

  if (!descricao) return { erro: 'Preencha a descrição.', ok: false }
  if (!trincasValidas(trincas)) {
    return { erro: 'Cada trinca precisa de SKU, part number e fabricante.', ok: false }
  }

  const supabase = await createClient()

  const { error: erroUpdate } = await supabase
    .from('pecas')
    .update({ descricao })
    .eq('id', id)
  if (erroUpdate) return { erro: mapErro(erroUpdate), ok: false }

  // Substitui as trincas (replace-all). Ver "Risco conhecido" no spec.
  const { error: erroDel } = await supabase
    .from('pecas_referencias')
    .delete()
    .eq('peca_id', id)
  if (erroDel) return { erro: mapErro(erroDel), ok: false }

  const { error: erroRef } = await supabase
    .from('pecas_referencias')
    .insert(trincas.map((t, i) => ({ peca_id: id, ...t, ordem: i })))
  if (erroRef) return { erro: mapErro(erroRef), ok: false }

  // Remoção de anexos marcados (bloco existente — manter como está)
  const removerIds = formData.getAll('remover').map((v) => String(v))
  if (removerIds.length) {
    const { data: aRem } = await supabase
      .from('pecas_anexos')
      .select('id, tipo, path')
      .eq('peca_id', id)
      .in('id', removerIds)

    const fotos = (aRem ?? []).filter((a) => a.tipo === 'foto').map((a) => a.path)
    const docs = (aRem ?? []).filter((a) => a.tipo === 'documento').map((a) => a.path)
    if (fotos.length) await supabase.storage.from(BUCKET_FOTOS).remove(fotos)
    if (docs.length) await supabase.storage.from(BUCKET_DOCS).remove(docs)
    await supabase.from('pecas_anexos').delete().eq('peca_id', id).in('id', removerIds)
  }

  const erroAnexo = await enviarAnexos(
    supabase,
    id,
    arquivosDe(formData, 'fotos'),
    arquivosDe(formData, 'documentos'),
  )
  if (erroAnexo) return { erro: erroAnexo, ok: false }

  revalidatePath('/pecas')
  return { erro: null, ok: true }
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: PASS. `actions.ts` não constrói `PecaLista`/`PecaDetalheData`, então segue compilando mesmo antes da Task 4.

- [ ] **Step 6 (opcional): Commit**

```bash
git add app/pecas/actions.ts
git commit -m "feat(pecas): actions gravam lista de trincas em pecas_referencias"
```

---

## Task 4: Camada de dados — `PecaLista`/`PecaDetalheData` com `referencias`

**Files:**
- Modify: `lib/pecas.ts`

**Interfaces:**
- Consumes: `Trinca` (Task 2).
- Produces: `PecaLista` e `PecaDetalheData` com `referencias: Trinca[]` (ordenadas por `ordem`); **sem** `sku`/`part_number`.

> Após esta task, `npx tsc --noEmit` acusa erros em `peca-card`, `peca-detalhe`, `pecas-view` e `peca-form` (ainda leem `.sku`/`.part_number`). Esperado — corrigidos nas Tasks 5–7.

- [ ] **Step 1: Importar `Trinca` e ajustar os tipos exportados**

No topo, adicionar ao import de tipos:

```ts
import type { Anexo, Trinca } from '@/lib/tipos'
```

Substituir os tipos `PecaLista` e `PecaDetalheData`:

```ts
export type PecaLista = {
  id: string
  descricao: string
  referencias: Trinca[]
  capaUrl: string | null
  qtdFotos: number
  qtdDocs: number
}

export type AnexoComUrl = Anexo & { url: string }

export type PecaDetalheData = {
  id: string
  descricao: string
  referencias: Trinca[]
  created_at: string
  fotos: AnexoComUrl[]
  documentos: AnexoComUrl[]
}
```

- [ ] **Step 2: Atualizar `listarPecas`** (query + map)

Trocar o `.select(...)` e o retorno do map:

```ts
export async function listarPecas(): Promise<PecaLista[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pecas')
    .select(
      'id, descricao, referencias:pecas_referencias(sku, part_number, fabricante, ordem), anexos:pecas_anexos(tipo, path, created_at)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map((p) => {
    const anexos = (p.anexos ?? []) as { tipo: string; path: string; created_at: string }[]
    const fotos = anexos
      .filter((a) => a.tipo === 'foto')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const docs = anexos.filter((a) => a.tipo === 'documento')
    const capa = fotos[0]
    const capaUrl = capa
      ? supabase.storage.from(BUCKET_FOTOS).getPublicUrl(capa.path).data.publicUrl
      : null

    const referencias = ((p.referencias ?? []) as (Trinca & { ordem: number })[])
      .sort((a, b) => a.ordem - b.ordem)
      .map(({ sku, part_number, fabricante }) => ({ sku, part_number, fabricante }))

    return {
      id: p.id,
      descricao: p.descricao,
      referencias,
      capaUrl,
      qtdFotos: fotos.length,
      qtdDocs: docs.length,
    }
  })
}
```

- [ ] **Step 3: Atualizar `buscarPeca`** (query + retorno)

Trocar o `.select(...)`:

```ts
  const { data, error } = await supabase
    .from('pecas')
    .select(
      'id, descricao, created_at, referencias:pecas_referencias(sku, part_number, fabricante, ordem), anexos:pecas_anexos(*)',
    )
    .eq('id', id)
    .maybeSingle()
```

Adicionar o cálculo de `referencias` (antes do `return`) e ajustar o objeto retornado:

```ts
  const referencias = ((data.referencias ?? []) as (Trinca & { ordem: number })[])
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ sku, part_number, fabricante }) => ({ sku, part_number, fabricante }))

  return {
    id: data.id,
    descricao: data.descricao,
    referencias,
    created_at: data.created_at,
    fotos,
    documentos,
  }
```

> Nota: em `buscarPeca`, `anexos` é derivado de `data.anexos` — a linha `const anexos = (data.anexos ?? []) as Anexo[]` permanece. Como o select agora inclui `referencias`, garanta que `data.anexos` continua sendo a chave `anexos:pecas_anexos(*)`.

- [ ] **Step 4: Verificar (parcial)**

Run: `npx tsc --noEmit`
Expected: erros **apenas** em `components/peca-card.tsx`, `components/peca-detalhe.tsx`, `components/pecas-view.tsx`, `components/peca-form.tsx` (uso de `.sku`/`.part_number`). `lib/pecas.ts` e `app/pecas/actions.ts` sem erros.

- [ ] **Step 5 (opcional): Commit**

```bash
git add lib/pecas.ts
git commit -m "feat(pecas): camada de dados expõe referencias por peça"
```

---

## Task 5: Formulário — estado em array de trincas

**Files:**
- Modify: `components/peca-form.tsx`

**Interfaces:**
- Consumes: `Trinca` (Task 2); `PecaDetalheData.referencias` (Task 4).
- Produces: form que envia `trinca_fabricante`/`trinca_sku`/`trinca_part_number` (listas paralelas) + `descricao`.

- [ ] **Step 1: Ajustar imports**

Adicionar `Plus` ao import do lucide-react e importar `Trinca`:

```ts
import { FileText, ImagePlus, Paperclip, Plus, X } from 'lucide-react'
import type { Trinca } from '@/lib/tipos'
```

- [ ] **Step 2: Adicionar estado e handlers das trincas** (junto aos outros `useState`, dentro do componente)

```ts
  const [trincas, setTrincas] = useState<Trinca[]>(
    peca?.referencias?.length
      ? peca.referencias.map((r) => ({ ...r }))
      : [{ sku: '', part_number: '', fabricante: '' }],
  )

  function atualizarTrinca(i: number, campo: keyof Trinca, valor: string) {
    setTrincas((ts) => ts.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t)))
  }
  function adicionarTrinca() {
    setTrincas((ts) => [...ts, { sku: '', part_number: '', fabricante: '' }])
  }
  function removerTrinca(i: number) {
    setTrincas((ts) => (ts.length === 1 ? ts : ts.filter((_, idx) => idx !== i)))
  }
```

- [ ] **Step 3: Substituir os blocos fixos de SKU e Part number** pelo bloco de trincas

Remover os dois `<div className="space-y-1.5">` de `sku` e de `part_number` (linhas ~59–73 do arquivo original) e colocar no lugar:

```tsx
      <div className="space-y-3">
        <Label>Referências (fabricante · SKU · part number)</Label>
        {trincas.map((t, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Trinca {i + 1}
              </span>
              {trincas.length > 1 && (
                <button
                  type="button"
                  onClick={() => removerTrinca(i)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
                >
                  <X className="size-3.5" />
                  Remover
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                name="trinca_fabricante"
                placeholder="Fabricante"
                required
                value={t.fabricante}
                onChange={(e) => atualizarTrinca(i, 'fabricante', e.target.value)}
              />
              <Input
                name="trinca_sku"
                placeholder="SKU"
                required
                value={t.sku}
                onChange={(e) => atualizarTrinca(i, 'sku', e.target.value)}
                className="font-mono"
              />
              <Input
                name="trinca_part_number"
                placeholder="Part number"
                required
                value={t.part_number}
                onChange={(e) => atualizarTrinca(i, 'part_number', e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={adicionarTrinca}>
          <Plus className="size-4" />
          Adicionar trinca
        </Button>
      </div>
```

> O bloco de `descricao` e os blocos de fotos/documentos permanecem inalterados, logo abaixo.

- [ ] **Step 4: Verificar (parcial)**

Run: `npx tsc --noEmit`
Expected: `peca-form.tsx` sem erros; restam erros apenas em `peca-card`, `peca-detalhe`, `pecas-view`.

Run: `npm run lint`
Expected: PASS (sem novos avisos; confirmar que `X` e `Plus` estão de fato usados).

- [ ] **Step 5 (opcional): Commit**

```bash
git add components/peca-form.tsx
git commit -m "feat(form): trincas em estado de array com adicionar/remover"
```

---

## Task 6: Exibição — card e detalhe listam todas as trincas

**Files:**
- Modify: `components/peca-card.tsx`
- Modify: `components/peca-detalhe.tsx`

**Interfaces:**
- Consumes: `PecaLista.referencias` (Task 4), `PecaDetalheData.referencias` (Task 4).

- [ ] **Step 1: `peca-card.tsx` — trocar `alt` e o corpo por lista de trincas**

Trocar o `alt` da imagem (linha ~22) por:

```tsx
            alt={peca.referencias[0]?.sku ?? peca.descricao}
```

Substituir o bloco `<div className="flex flex-1 flex-col gap-1 p-4"> ... </div>` (as duas linhas fixas de SKU/Part number + descrição + contadores) por:

```tsx
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="space-y-1">
          {peca.referencias.map((r, i) => (
            <div key={i} className="flex items-baseline gap-2 text-xs">
              <span className="min-w-0 max-w-[40%] shrink-0 truncate font-medium text-foreground/70">
                {r.fabricante}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono font-semibold text-primary">
                {r.sku}
              </span>
              <span className="min-w-0 max-w-[40%] shrink-0 truncate font-mono text-foreground/60">
                {r.part_number}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{peca.descricao}</p>

        <div className="mt-auto flex items-center gap-4 pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="size-3.5" />
            {peca.qtdFotos}
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="size-3.5" />
            {peca.qtdDocs}
          </span>
        </div>
      </div>
```

- [ ] **Step 2: `peca-detalhe.tsx` — cabeçalho lista todas as trincas**

Substituir o `<DialogHeader> ... </DialogHeader>` atual (bloco com SKU + Part number únicos) por:

```tsx
      <DialogHeader>
        <DialogTitle className="sr-only">
          {peca.referencias[0]?.sku ?? 'Detalhe da peça'}
        </DialogTitle>
        <div className="space-y-3">
          {peca.referencias.map((r, i) => (
            <div key={i} className="flex flex-wrap items-start gap-x-8 gap-y-2">
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Fabricante
                </p>
                <p className="text-sm font-medium text-foreground">{r.fabricante}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  SKU
                </p>
                <p className="font-mono text-lg text-primary">{r.sku}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Part number
                </p>
                <p className="font-mono text-sm text-foreground">{r.part_number}</p>
              </div>
            </div>
          ))}
        </div>
      </DialogHeader>
```

Remover o import não usado `DialogDescription` de `peca-detalhe.tsx` se ele deixar de ser referenciado (o `<p className="text-sm text-foreground/80">{peca.descricao}</p>` logo abaixo permanece).

- [ ] **Step 3: Verificar (parcial)**

Run: `npx tsc --noEmit`
Expected: restam erros apenas em `components/pecas-view.tsx`.

Run: `npm run lint`
Expected: PASS (sem imports órfãos em `peca-detalhe.tsx`).

- [ ] **Step 4 (opcional): Commit**

```bash
git add components/peca-card.tsx components/peca-detalhe.tsx
git commit -m "feat(ui): card e detalhe listam todas as trincas"
```

---

## Task 7: Busca sobre trincas + verificação final

**Files:**
- Modify: `components/pecas-view.tsx`

**Interfaces:**
- Consumes: `PecaLista.referencias` (Task 4), `PecaDetalheData.referencias` (Task 4).

- [ ] **Step 1: Atualizar o filtro `pecasFiltradas`**

Substituir o corpo do `useMemo` (o `pecas.filter(...)`) por:

```ts
  const pecasFiltradas = useMemo(() => {
    const q = normalizar(busca.trim())
    if (!q) return pecas
    return pecas.filter(
      (p) =>
        normalizar(p.descricao).includes(q) ||
        p.referencias.some(
          (r) =>
            normalizar(r.sku).includes(q) ||
            normalizar(r.part_number).includes(q) ||
            normalizar(r.fabricante).includes(q),
        ),
    )
  }, [pecas, busca])
```

- [ ] **Step 2: Atualizar o placeholder do input de busca**

```tsx
              placeholder="Buscar por SKU, part number, fabricante ou descrição…"
```

- [ ] **Step 3: Atualizar a `DialogDescription` do diálogo "Editar"** (usa `pecaSel.sku`, que não existe mais)

Trocar:

```tsx
            {pecaSel && (
              <DialogDescription className="font-mono">
                {pecaSel.referencias[0]?.sku}
              </DialogDescription>
            )}
```

- [ ] **Step 4: Atualizar o texto da `DialogDescription` do diálogo "Nova peça"** (opcional, coerência)

```tsx
            <DialogDescription>
              Cadastre uma peça com descrição, trincas (fabricante · SKU · part number) e anexos.
            </DialogDescription>
```

- [ ] **Step 5: Verificação de tipos + lint (gate)**

Run: `npx tsc --noEmit`
Expected: PASS — zero erros no projeto inteiro.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Build (gate final)**

Run: `npm run build`
Expected: build conclui sem erros de tipo/compilação.

- [ ] **Step 7: Smoke test manual** (`npm run dev`, aplicar antes o SQL da Task 1 no Supabase)

Verificar, em `/pecas`:
1. **Nova peça** → adicionar 2 trincas (ex.: `SKF · SKF-6205 · 6205-2RS` e `NSK · NSK-6205 · 6205DDU`) + descrição → **Cadastrar** → toast de sucesso.
2. O **card** da peça mostra as 2 trincas empilhadas.
3. Abrir **detalhe** → as 2 trincas aparecem no cabeçalho.
4. **Editar** → remover 1 trinca e alterar outra → **Salvar** → card/detalhe refletem a mudança.
5. **Busca** por fabricante (ex.: "NSK"), por SKU e por part number retorna a peça.
6. Tentar cadastrar SKU já existente → mensagem de erro amigável (constraint `unique`).
7. Cadastrar com uma trinca incompleta → bloqueado (validação nativa `required` + checagem no servidor).

- [ ] **Step 8 (opcional): Commit**

```bash
git add components/pecas-view.tsx
git commit -m "feat(busca): filtra por trincas (sku/part number/fabricante)"
```

---

## Self-Review (cobertura do spec)

- **Nova tabela `pecas_referencias` + unique(sku) + RLS + índice** → Task 1. ✓
- **`pecas` perde sku/part_number + migração com placeholder "Não informado"** → Task 1. ✓
- **Tipos `Trinca`/`Referencia`** → Task 2. ✓
- **Parsing por listas paralelas + validação (≥1 trinca, 3 campos)** → Task 3. ✓
- **`criarPeca` (insert peça → trincas → anexos, com rollback)** → Task 3. ✓
- **`atualizarPeca` (update descricao + replace trincas + anexos)** → Task 3. ✓
- **`listarPecas`/`buscarPeca` com `referencias` ordenadas** → Task 4. ✓
- **Formulário com estado em array, adicionar/remover, ≥1 linha** → Task 5. ✓
- **Card lista todas as trincas (sem limite)** → Task 6. ✓
- **Detalhe lista todas as trincas** → Task 6. ✓
- **Busca por sku/part number/fabricante/descrição** → Task 7. ✓
- **Fora de escopo (reordenar, "principal", busca server-side)** — não implementado. ✓
