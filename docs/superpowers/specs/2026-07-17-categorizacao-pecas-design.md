# Categorização de peças (criar ou selecionar categoria no cadastro)

**Data:** 2026-07-17
**Status:** Aprovado para implementação

## Problema

As peças não têm nenhuma forma de agrupamento. Não dá para agrupar/filtrar por tipo
(ex.: "Rolamentos", "Vedantes", "Importados"). Ao cadastrar, o usuário precisa poder
**criar uma categoria nova** ou **selecionar uma existente**, sem sair do formulário.

## Objetivo

Adicionar uma categoria (única) por peça, escolhida/criada no próprio formulário de
cadastro/edição, exibida no card e no detalhe, e usável como filtro na listagem.

## Decisões tomadas

- **Uma categoria por peça** (não N:N): coluna `pecas.categoria_id`.
- **Opcional:** a peça pode ficar sem categoria (`categoria_id` nulo).
- **Criar-ou-selecionar num único campo** via `<input list>` + `<datalist>` (sem
  componente novo; bom para mobile/PWA). Digitar um nome novo cria a categoria; digitar/
  escolher um nome existente reaproveita.
- **Unicidade case-insensitive** do nome (índice único em `lower(nome)`) — evita
  duplicatas "Rolamentos" vs "rolamentos".
- **Filtro na listagem:** chips de categoria (derivados das categorias **presentes** nas
  peças) que combinam com a busca por texto existente (AND).
- Sem tela de gerenciamento de categorias (renomear/excluir) e sem categorias aninhadas.

## Modelo de dados

### Nova tabela `public.categorias`

| coluna       | tipo                                          | observações                         |
|--------------|-----------------------------------------------|-------------------------------------|
| `id`         | uuid PK default `gen_random_uuid()`           |                                     |
| `nome`       | text not null                                 | nome como digitado (trim)           |
| `created_at` | timestamptz not null default `now()`          |                                     |
| `created_by` | uuid → `auth.users(id)` default `auth.uid()`  |                                     |

- Índice único case-insensitive: `create unique index categorias_nome_lower_idx on public.categorias (lower(nome));`
- RLS habilitado + 4 policies `select/insert/update/delete to authenticated` (padrão das
  outras tabelas).

### Alteração em `public.pecas`

- `alter table public.pecas add column categoria_id uuid references public.categorias(id) on delete set null;`
- Nullable; peças existentes ficam com `categoria_id` nulo (sem migração de dados).

## Resolver categoria (criar-ou-selecionar) — servidor

O formulário envia um único campo `categoria` (o nome digitado/escolhido). Um helper em
`app/pecas/actions.ts` resolve para um id (ou null):

```ts
// Retorna { id } | { erro }. Trim; vazio => null (categoria opcional).
async function resolverCategoria(
  supabase: SupabaseClient,
  nomeBruto: string,
): Promise<{ id: string | null; erro: string | null }> {
  const nome = nomeBruto.trim()
  if (!nome) return { id: null, erro: null }

  // 1) Busca case-insensitive por nome existente.
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

- `criarPeca`: resolve a categoria e inclui `categoria_id` no insert da peça.
- `atualizarPeca`: resolve a categoria e inclui `categoria_id` no update da peça.
- Se `resolverCategoria` retornar `erro`, a action retorna esse erro (a peça não é
  criada/alterada; nos casos de criar, o rollback existente já cobre).

> Nota `ilike`: o nome é tratado como literal (sem `%`), então `ilike` funciona como
> igualdade case-insensitive. Nomes com `%`/`_` são raros em categorias; se um dia
> virarem problema, trocar por `.eq('nome', nome)` com normalização — fora de escopo.

## Tipos (`lib/tipos.ts`)

```ts
export type Categoria = {
  id: string
  nome: string
}
```

## Camada de dados (`lib/pecas.ts`)

- `PecaLista` e `PecaDetalheData` ganham `categoria: Categoria | null`.
- `listarPecas` / `buscarPeca`: incluir `categoria:categorias(id, nome)` no select e mapear
  para `categoria` (o join 1:1 retorna objeto ou null).
- Nova função `listarCategorias(): Promise<Categoria[]>` — todas as categorias, ordenadas
  por `nome` (para o datalist do formulário).

## Página (`app/pecas/page.tsx`)

- Buscar `categorias` em paralelo com `pecas` e passar ambos para `PecasView`:

```ts
const [pecas, categorias] = await Promise.all([listarPecas(), listarCategorias()])
return <PecasView pecas={pecas} categorias={categorias} />
```

## Formulário (`components/peca-form.tsx`)

- Nova prop `categorias: Categoria[]`.
- Campo novo no topo do form (antes das referências ou logo após — ver plano):

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

- Campo não é `required` (categoria opcional). Digitar um nome novo cria a categoria no
  servidor; escolher/digitar um existente reaproveita.

## Exibição

### Card (`components/peca-card.tsx`)
- Badge da categoria (usa `components/ui/badge.tsx`) quando `peca.categoria` existe; nada
  quando nulo. Posição: junto ao rodapé de contadores ou no topo do corpo (ver plano).

### Detalhe (`components/peca-detalhe.tsx`)
- Badge da categoria no cabeçalho (quando existir).

## Filtro na listagem (`components/pecas-view.tsx`)

- Nova prop `categorias` (para consistência; mas as chips derivam das categorias
  **presentes** nas peças para não mostrar chips vazios):

```ts
const categoriasPresentes = useMemo(() => {
  const mapa = new Map<string, Categoria>()
  for (const p of pecas) if (p.categoria) mapa.set(p.categoria.id, p.categoria)
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome))
}, [pecas])
```

- Estado `categoriaSel: string | null` (id). Chips: **"Todas"** + uma por categoria
  presente. Clicar alterna a seleção.
- `pecasFiltradas` combina categoria + busca de texto (AND):

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

- As chips só aparecem quando há ≥1 categoria presente. A contagem no cabeçalho passa a
  refletir também o filtro de categoria.

## Fora de escopo

- Gerenciar categorias (renomear, excluir, mesclar).
- Categorias aninhadas / múltiplas por peça.
- Busca/filtro server-side (continua client-side).

## Riscos conhecidos (aceitos)

- **Resolver categoria não é atômico:** entre a busca e o insert há uma janela de corrida;
  mitigada pelo re-select após 23505. Aceitável para uso interno de baixa concorrência.
- **`ilike` com nome contendo `%`/`_`** casaria como wildcard — improvável em nomes de
  categoria; fora de escopo tratar agora (ver nota acima).

## Arquivos afetados

- `docs/supabase/setup.sql` (schema + migração `add column`)
- `lib/tipos.ts`
- `lib/pecas.ts`
- `app/pecas/actions.ts`
- `app/pecas/page.tsx`
- `components/peca-form.tsx`
- `components/peca-card.tsx`
- `components/peca-detalhe.tsx`
- `components/pecas-view.tsx`
