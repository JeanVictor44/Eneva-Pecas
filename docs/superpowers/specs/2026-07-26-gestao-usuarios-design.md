# Gestão de usuários e permissões — Design

Data: 2026-07-26

## Problema

Hoje qualquer pessoa com login faz tudo: cadastra, edita e exclui peças. As policies
de RLS são todas `to authenticated using (true)`. Não há como dar acesso só de
consulta a alguém, nem como criar um usuário novo sem entrar no painel do Supabase.

## Objetivo

Um módulo de gestão de usuários onde um administrador cria logins e define, por
usuário, o que cada um pode fazer.

## Permissões

Cinco chaves independentes, marcadas uma a uma por usuário (sem perfis nomeados):

| Chave | O que libera |
|---|---|
| `visualizar` | Ver peças, categorias, fotos e documentos |
| `criar` | Cadastrar peça nova |
| `editar` | Alterar peça existente (inclui adicionar/remover anexos) |
| `excluir` | Apagar peça |
| `gerir_usuarios` | Acessar `/usuarios`: criar, editar permissões, ativar/desativar, redefinir senha |

`excluir` é separada de `editar` porque a exclusão é irreversível e leva fotos e
documentos junto.

Além das permissões, cada usuário tem um sinalizador `ativo`. Inativo perde acesso a
tudo sem apagar nada — o vínculo `created_by` das peças que ele cadastrou permanece.

## Arquitetura

Fonte única de verdade: a tabela `public.perfis` no Postgres. As policies de RLS
consultam essa tabela através de uma função `security definer`. Permissões **não**
vão para o JWT — assim, revogar acesso vale no clique seguinte, sem esperar o token
renovar.

A autorização existe em duas camadas, e as duas são necessárias:

- **RLS no Postgres** — a barreira real. A anon key é pública e fica no bundle do
  browser; um usuário logado pode chamar a API REST do Supabase direto com o próprio
  token, sem passar pelas Server Actions. Só o RLS o detém.
- **App (Server Actions + UI)** — dá a mensagem de erro certa e esconde botões que a
  pessoa não pode usar. É ergonomia, não segurança.

### Banco

```sql
create table public.perfis (
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
```

Função consultada pelas policies:

```sql
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
```

O `security definer` é obrigatório, não estilístico: a policy da própria tabela
`perfis` chama `pode()`, que lê `perfis`. Sem `security definer` (que roda como dono
da tabela e por isso ignora RLS) o Postgres entra em recursão infinita. Pelo mesmo
motivo, `perfis` **não** pode receber `force row level security`.

`search_path` fixo em `public` fecha o vetor clássico de sequestro de resolução de
nomes em função `security definer`.

Migração idempotente, acrescentada ao `docs/supabase/setup.sql` existente:

1. Cria a tabela, a função e as policies (tudo com `if not exists` / `drop policy if exists`).
2. Backfill: todo usuário já existente em `auth.users` ganha perfil com as cinco
   permissões ligadas e `ativo = true` (decisão do usuário: base pequena, ajuste pela
   tela depois; risco zero de ninguém conseguir entrar).
3. Substitui as policies `using (true)` das tabelas de peças pelas novas.

### Policies

Para `pecas`, `pecas_referencias` e `pecas_anexos`:

| Comando | Condição |
|---|---|
| `select` | `pode('visualizar')` |
| `insert` | `pode('criar')` |
| `update` | `pode('editar')` |
| `delete` | `pode('excluir')` |

Duas exceções deliberadas:

- **`categorias`**: `insert` aceita `pode('criar') or pode('editar')` — o
  `resolverCategoria` cria categoria nova tanto no cadastro quanto na edição de peça.
  `update`/`delete` exigem `pode('editar')`; não há UI para isso hoje.
- **Storage** (`pecas-fotos`, `pecas-documentos`): `insert` aceita
  `pode('criar') or pode('editar')`; `delete` aceita `pode('editar') or pode('excluir')`
  — remover uma foto é edição, e apagar a peça leva os arquivos junto.
  `select` em `pecas-documentos` exige `pode('visualizar')` (é o bucket privado, usado
  via URL assinada). O bucket `pecas-fotos` é público e continua assim.

Para `perfis`:

| Comando | Condição |
|---|---|
| `select` | `user_id = auth.uid() or pode('gerir_usuarios')` |
| `insert` / `update` / `delete` | `pode('gerir_usuarios')` |

No `update`, a condição vai tanto em `using` quanto em `with check` — só `using`
permitiria editar uma linha e deixá-la num estado que a policy rejeitaria.

### Service role key

Criar login, redefinir senha e apagar usuário órfão exigem a Admin API do Supabase,
que só funciona com a service role key.

- Variável nova no `.env` e no `.env.local.example`: `SUPABASE_SERVICE_ROLE_KEY`
  (**sem** `NEXT_PUBLIC_`). O `.gitignore` já cobre `.env*`.
- Isolada em `lib/supabase/admin.ts`, com guarda de runtime que lança se o módulo for
  avaliado no browser, e `auth: { persistSession: false, autoRefreshToken: false }`.
- Essa chave ignora RLS por completo. Portanto, toda ação que a usa checa
  `gerir_usuarios` **antes** de instanciar o cliente admin.

O usuário precisa copiar a chave do painel do Supabase (Settings → API) antes de rodar.

## Componentes

### `lib/permissoes.ts` — vocabulário puro

Tipos e constantes. **Sem nenhum import de servidor**, porque componentes client
precisam dos rótulos e da lista de permissões para desenhar os checkboxes.

- `PERMISSOES` — a lista das cinco chaves, na ordem de exibição
- `type Permissao = (typeof PERMISSOES)[number]`
- `type Permissoes = Record<Permissao, boolean>`
- `ROTULOS: Record<Permissao, string>` — texto de cada checkbox e badge
- `SEM_PERMISSOES` — todas em `false`
- `COLUNAS_PERFIL` / `type LinhaPerfil` / `permissoesDaLinha(linha)` /
  `colunasDePermissoes(p)` — tradução nos dois sentidos entre as colunas `pode_*` do
  banco e o objeto `Permissoes`

### `lib/perfil.ts` — leitura no servidor

- `type PerfilAtual = { userId, email, nome, ativo, permissoes }`
- `perfilAtual(): Promise<PerfilAtual | null>` — usuário logado + perfil; `null` se
  não houver sessão.
- `exigir(p: Permissao): Promise<string | null>` — devolve a mensagem de erro quando
  falta a permissão, ou `null` quando está liberado.

Depende de `lib/supabase/server.ts` e de `lib/permissoes.ts`. A separação é
necessária: juntar as duas coisas num arquivo só arrastaria `next/headers` para
dentro do bundle do browser assim que um componente client importasse `ROTULOS`.

### `lib/usuarios.ts`

Leitura da lista para a tela de gestão.

- `type UsuarioLista = { userId, email, nome, ativo, permissoes }`
- `listarUsuarios(): Promise<UsuarioLista[]>` — cruza `perfis` com os e-mails vindos
  da Admin API (`auth.admin.listUsers`), já que `auth.users` não é legível via
  PostgREST. Ordena por nome/e-mail. Como usa a service role key, **checa
  `gerir_usuarios` antes de instanciar o cliente admin** e lança se faltar — a
  proteção do layout não basta, porque a função é chamável de qualquer lugar do
  servidor.

### `app/usuarios/actions.ts`

Server Actions. Todas começam checando `gerir_usuarios`.

- `criarUsuario(_prev, formData)` — valida nome, e-mail e senha (mínimo 8
  caracteres); cria via `auth.admin.createUser` com `email_confirm: true`; insere o
  perfil. Se o insert do perfil falhar, remove o usuário recém-criado — mesma
  compensação que `criarPeca` já faz quando as trincas falham.
- `atualizarUsuario(userId, _prev, formData)` — nome, permissões e `ativo`. Grava
  `updated_at: now()` junto (a coluna não tem trigger; quem escreve é a ação).
- `redefinirSenha(userId, _prev, formData)` — nova senha via Admin API.

Estado de retorno no formato já usado no projeto: `{ erro: string | null; ok: boolean }`.

### Travas contra lockout

Verificadas no servidor, em `atualizarUsuario`:

1. Não é possível remover o próprio `gerir_usuarios`.
2. Não é possível desativar a si mesmo.
3. Não é possível remover `gerir_usuarios` de, nem desativar, o **último** gestor
   ativo do sistema.

Cada uma devolve uma mensagem específica dizendo o porquê.

### Telas

**`app/usuarios/layout.tsx`** — busca o perfil e redireciona para `/sem-acesso` quem
não tem `gerir_usuarios`. Proteção no servidor; esconder o link do menu não é
proteção.

**`app/usuarios/page.tsx`** — carrega a lista e o perfil atual, entrega para a view.

**`components/usuarios-view.tsx`** (client) — lista em cartões, no padrão visual de
`PecaCard`: nome (ou e-mail, quando não houver nome), e-mail em texto secundário,
badges das permissões ativas e marca "Inativo" quando for o caso. Botão "Novo
usuário". Sem tabela: já é responsivo e combina com o resto do app. Sem busca —
a lista é curta; entra depois se crescer.

**`components/usuario-form.tsx`** (client) — usado nos dois diálogos:

- *Novo usuário*: nome, e-mail, senha, cinco checkboxes.
- *Editar usuário*: nome, cinco checkboxes e ativo/inativo. E-mail não é editável —
  trocar e-mail de login envolve confirmação e está fora do escopo.

**`components/redefinir-senha.tsx`** (client) — botão que revela o campo de nova
senha. É um componente separado com o próprio `<form>`, e o dialog de edição o
compõe **ao lado** do `UsuarioForm`, não dentro: HTML não permite `<form>` aninhado,
e o navegador descarta o interno sem avisar.

**`app/sem-acesso/page.tsx`** — mensagem curta e botão de sair, para quem está
inativo ou sem `visualizar`.

**`components/ui/checkbox.tsx`** — não existe ainda; entra seguindo o mesmo padrão
base-ui/shadcn dos componentes já presentes. O controle ativo/inativo reaproveita
esse checkbox em vez de trazer um `switch` para um único uso.

**`components/header.tsx`** — ganha link "Usuários" (ícone `Users` do lucide),
renderizado só para quem tem a permissão. O header já é async e já consulta o
Supabase.

### Impacto no módulo de peças

- `app/pecas/actions.ts` — `criarPeca`, `atualizarPeca` e `excluirPeca` começam com
  `exigir('criar' | 'editar' | 'excluir')`.
- `app/pecas/layout.tsx` — redireciona para `/sem-acesso` quem está inativo ou sem
  `visualizar`.
- `app/pecas/page.tsx` — carrega as permissões junto com a lista e repassa.
- `components/pecas-view.tsx` — sem `criar`, o botão "Nova peça" some e o estado
  vazio deixa de convidar ao cadastro.
- `components/peca-detalhe.tsx` — botões "Editar" e "Excluir" condicionados às
  permissões correspondentes.
- `lib/erros.ts` — trata o código `42501` (violação de RLS) como "Você não tem
  permissão para esta ação." Sem isso, um bloqueio do banco chega ao usuário como
  `new row violates row-level security policy`.

## Fluxo de dados

Criar usuário:

```
UsuarioForm → criarUsuario (Server Action)
  → exigir('gerir_usuarios')            [nega antes de tocar na service key]
  → admin.auth.admin.createUser(...)    [service role]
  → perfis.insert(...)                  [service role]
      falhou? → admin.auth.admin.deleteUser(id)   [compensação]
  → revalidatePath('/usuarios')
```

Ler uma peça:

```
PecasPage → listarPecas() → PostgREST
  → policy pecas_select → public.pode('visualizar') → perfis
```

## Erros

| Situação | Resposta |
|---|---|
| Sem permissão, via app | Mensagem específica do `exigir`, exibida com `toast.error` |
| Sem permissão, direto no PostgREST | Bloqueado pelo RLS; se chegar ao app, `mapErro` traduz o `42501` |
| E-mail já cadastrado | Mensagem da Admin API, mapeada para "Este e-mail já tem cadastro." |
| Senha curta | Validação no servidor antes de chamar a API |
| Perfil falha após criar login | Login removido; nada fica órfão |
| Trava de lockout | Mensagem dizendo qual das três travas impediu |
| Usuário sem perfil (caso de borda) | `pode()` retorna `false` em tudo; cai em `/sem-acesso` |

## Verificação

O projeto não tem infraestrutura de testes automatizados — não há runner nem script
`test`, e montar uma é um projeto à parte. A verificação será:

1. `npm run lint` e `npm run build` limpos.
2. Roteiro manual com dois usuários (um gestor, um restrito), cobrindo cada permissão
   ligada e desligada, mais as três travas de lockout.
3. **Teste do RLS por fora do app**: com o token de um usuário só-visualizar, tentar
   `insert`/`update`/`delete` chamando a API REST do Supabase direto. Precisa falhar.
   É esse passo que prova que a segurança não depende da UI.

O roteiro detalhado fica no plano de implementação.

## Fora de escopo

- Excluir usuário (só desativar)
- Trocar o e-mail de login
- Log de auditoria de quem mudou permissão de quem
- Recuperação de senha por e-mail (o admin redefine na tela)
- Perfis/grupos nomeados — as cinco chaves são marcadas individualmente
- Permissão por categoria ou por peça específica
