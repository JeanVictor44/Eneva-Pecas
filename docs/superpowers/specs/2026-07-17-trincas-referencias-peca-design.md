# Trincas de referência por peça (fabricante · SKU · part number)

**Data:** 2026-07-17
**Status:** Aprovado para implementação

## Problema

Hoje cada peça tem exatamente **um** `sku` (único) e **um** `part_number`, gravados
como colunas na tabela `pecas`. A mesma peça física, porém, costuma ser fornecida por
vários fabricantes — cada um com seu próprio SKU e part number. O modelo atual não
representa isso.

## Objetivo

No cadastro/edição de peça, permitir adicionar **mais de uma trinca**
`SKU + part number + nome do fabricante`. A identidade da peça passa a ser essa
**lista de trincas**; a peça em si guarda apenas `descricao` + anexos (fotos/documentos).

O campo **nome do fabricante** é novo (não existe hoje).

## Decisões tomadas

- **Substituir, não acrescentar:** a lista de trincas substitui os campos `sku`/`part_number`
  de `pecas`. Toda trinca é igual (não há "principal" separado); a ordem preserva qual foi
  cadastrada primeiro.
- **Persistência normalizada:** nova tabela `pecas_referencias` (relação N por peça, no
  mesmo espírito de `pecas_anexos`). Descartado JSONB — a tabela mantém `sku` único no banco,
  segue o padrão existente e não complica a busca.
- **Card mostra todas as trincas**, empilhadas e sem limite de quantidade.
- **Peças legadas:** a migração move o `sku`/`part_number` atual para a primeira trinca; como
  não havia fabricante, usa o placeholder `"Não informado"`.

## Modelo de dados

### Nova tabela `public.pecas_referencias`

| coluna       | tipo                                   | observações                                  |
|--------------|----------------------------------------|----------------------------------------------|
| `id`         | uuid PK default `gen_random_uuid()`    |                                              |
| `peca_id`    | uuid not null → `pecas(id)` on delete cascade |                                       |
| `sku`        | text not null **unique (global)**      | mantém a garantia de SKU único de hoje       |
| `part_number`| text not null                          |                                              |
| `fabricante` | text not null                          | campo novo                                   |
| `ordem`      | smallint not null default 0            | 0-based; preserva a ordem de cadastro        |
| `created_at` | timestamptz not null default `now()`   |                                              |
| `created_by` | uuid → `auth.users(id)` default `auth.uid()` |                                        |

- Índice em `peca_id` (`pecas_referencias_peca_id_idx`).
- Constraint `unique (sku)` — SKU único globalmente (entre peças e dentro da mesma peça).
- RLS: mesmas 4 policies `select/insert/update/delete to authenticated` das outras tabelas.

### Alteração em `public.pecas`

- **Remove** as colunas `sku` e `part_number`. Sobra: `id`, `descricao`, `created_at`, `created_by`.

### Migração (ordem importa)

1. `create table pecas_referencias ...` + índice + RLS.
2. Copiar dados existentes:
   `insert into pecas_referencias (peca_id, sku, part_number, fabricante, ordem)
    select id, sku, part_number, 'Não informado', 0 from pecas;`
3. `alter table pecas drop column sku, drop column part_number;`

O arquivo `docs/supabase/setup.sql` é atualizado para refletir o estado final (schema novo).
A migração acima (passos 2–3) fica como um bloco/arquivo aplicável ao banco já existente.

## Tipos (`lib/tipos.ts`)

```ts
export type Referencia = {
  id: string
  peca_id: string
  sku: string
  part_number: string
  fabricante: string
  ordem: number
  created_at: string
}

// Trinca em edição no formulário (sem id/persistência)
export type TrincaInput = {
  sku: string
  part_number: string
  fabricante: string
}
```

## Camada de dados (`lib/pecas.ts`)

- `PecaLista` e `PecaDetalheData` deixam de ter `sku`/`part_number` e passam a ter
  `referencias: { sku; part_number; fabricante }[]` (ordenadas por `ordem`).
- `listarPecas`: incluir `referencias:pecas_referencias(sku, part_number, fabricante, ordem)`
  no select; ordenar por `ordem` no map.
- `buscarPeca`: idem, incluir as referências ordenadas.
- `capaUrl` e contagens de anexos permanecem iguais.

## Server actions (`app/pecas/actions.ts`)

### Parsing das trincas
As trincas chegam como três listas paralelas no `FormData` (mesmo padrão de `remover[]`):

```ts
function trincasDe(formData: FormData): TrincaInput[] {
  const skus = formData.getAll('trinca_sku').map((v) => String(v).trim())
  const pns  = formData.getAll('trinca_part_number').map((v) => String(v).trim())
  const fabs = formData.getAll('trinca_fabricante').map((v) => String(v).trim())
  return skus.map((sku, i) => ({
    sku, part_number: pns[i] ?? '', fabricante: fabs[i] ?? '',
  }))
}
```

Validação: pelo menos **1** trinca; em cada trinca os 3 campos são obrigatórios.
Erro → `{ erro: 'Cada trinca precisa de SKU, part number e fabricante.', ok: false }`.

### `criarPeca`
1. Valida `descricao` e as trincas.
2. Insere a peça (`{ descricao }`), pega `id`.
3. Insere as trincas em `pecas_referencias` com `ordem = índice`.
4. Se falhar a inserção das trincas (ex.: SKU duplicado) → apaga a peça recém-criada e
   retorna o erro mapeado.
5. Envia anexos (fluxo atual inalterado). Se falhar → desfaz a peça (cascade limpa trincas/anexos).

### `atualizarPeca`
1. Valida `descricao` e as trincas.
2. `update pecas set descricao` .
3. **Substitui** as trincas: `delete from pecas_referencias where peca_id = id`, depois insere
   as novas com `ordem = índice`. (Replace-all é seguro: trincas não têm dependentes; deletar
   antes de inserir evita conflito com o próprio SKU no constraint unique.)
4. Remoção de anexos marcados + novos anexos (fluxo atual inalterado).

Erros de SKU duplicado são traduzidos por `mapErro` (mensagem amigável).

**Risco conhecido (aceito):** o `delete` seguido de `insert` em `atualizarPeca` não é
atômico — se o `insert` falhar (ex.: SKU já usado por outra peça), as trincas antigas já
terão sido apagadas. Isso é coerente com o restante do código (anexos também operam em
best-effort). Mitigação nesta versão: em falha, retornar o erro para o usuário reenviar;
uma função Postgres transacional fica como melhoria futura (fora de escopo).

## Formulário (`components/peca-form.tsx`)

- Novo estado controlado:
  `const [trincas, setTrincas] = useState<TrincaInput[]>(...)`.
  - Nova peça: `[{ sku:'', part_number:'', fabricante:'' }]`.
  - Editar: inicializa a partir de `peca.referencias`.
- UI: bloco "Referências" no topo do form (substitui os campos únicos de SKU e part number).
  Cada linha da lista tem 3 inputs — **Fabricante**, **SKU** (fonte mono), **Part number**
  (fonte mono) — e um botão remover (ícone lixeira), desabilitado/oculto quando só há 1 linha.
  Botão **"+ Adicionar trinca"** ao final anexa uma linha vazia.
- Inputs controlados com `name="trinca_fabricante" | "trinca_sku" | "trinca_part_number"` e
  `value`/`onChange` ligados ao índice no array. Como têm `name`, o `FormData` os coleta na
  ordem em que estão no array.
- `required` nos inputs para validação nativa do browser; a action revalida no servidor.
- A `descricao` e os blocos de fotos/documentos permanecem como estão.

## Exibição

### Card (`components/peca-card.tsx`)
- Substitui as duas linhas fixas (SKU / Part number) por uma lista das trincas, **sem limite**:
  cada linha compacta `fabricante · sku · part_number`, com truncamento por linha.
- `alt` da imagem passa a usar a primeira trinca (ou a descrição).

### Detalhe (`components/peca-detalhe.tsx`)
- Cabeçalho passa a listar todas as trincas (fabricante / SKU / part number) no lugar do
  bloco único atual. Mantém o mesmo estilo visual (rótulos pequenos em maiúsculas, SKU em
  destaque mono).

## Busca (`components/pecas-view.tsx`)

- O filtro (`pecasFiltradas`) passa a considerar, para cada peça, **todas as trincas**:
  match se `normalizar(q)` estiver contido em qualquer `sku`, `part_number` ou `fabricante`
  de qualquer trinca, ou na `descricao`. Continua client-side.
- Placeholder do input: "Buscar por SKU, part number, fabricante ou descrição…".

## Fora de escopo

- Reordenar trincas via drag-and-drop (a ordem é a de cadastro).
- Marcar uma trinca como "principal" (todas são iguais).
- Busca server-side / paginação.

## Arquivos afetados

- `docs/supabase/setup.sql` (schema final) + bloco de migração
- `lib/tipos.ts`
- `lib/pecas.ts`
- `app/pecas/actions.ts`
- `components/peca-form.tsx`
- `components/peca-card.tsx`
- `components/peca-detalhe.tsx`
- `components/pecas-view.tsx`
