# Design — Catálogo de Peças (eneva-pecas)

- **Data:** 2026-07-17
- **Status:** Aprovado para planejamento
- **Autor:** Kalil Aziz (via brainstorming com Claude)

## 1. Contexto e objetivo

Aplicação web interna para **cadastrar e consultar peças** (contexto de
manutenção). Cada peça possui SKU, part number (número do fabricante),
descrição, **múltiplas fotos** e **múltiplos documentos**. O acesso é restrito
a usuários autenticados, criados manualmente no painel do Supabase (sem tela de
auto-cadastro). O catálogo é **compartilhado**: qualquer usuário autenticado
pode ver, criar, editar e excluir qualquer peça.

## 2. Escopo

Dentro do escopo:

- Login por e-mail e senha (sem sign up na aplicação).
- Logout.
- CRUD completo de peças (criar, listar, ver detalhe, editar, excluir).
- Upload de **várias fotos** e **vários documentos** por peça, com remoção
  individual.
- Visualização de detalhe em **modal com URL própria** (parallel + intercepting
  routes) e como página cheia em acesso direto.

Fora de escopo (YAGNI, por enquanto):

- Papéis/permissões diferenciadas (todos os autenticados têm o mesmo poder).
- Auto-cadastro, recuperação de senha e convites (gerenciado no painel Supabase).
- Busca/filtros avançados, paginação, categorias, estoque/quantidade.
- Testes automatizados (validação manual + checagem de tipos nesta fase).

## 3. Stack e arquitetura

- **Next.js (App Router) + TypeScript**, criado com `create-next-app`.
- **Tailwind CSS** para estilo.
- **Supabase**: `@supabase/supabase-js` + `@supabase/ssr` para autenticação com
  sessão em **cookies** (httpOnly).
- **`middleware.ts`** valida/renova a sessão e redireciona não autenticados para
  `/login` antes de renderizar rotas protegidas.
- **Server Actions** para gravações (criar/editar/excluir e uploads) e para
  gerar URLs assinadas de documentos, mantendo a lógica de escrita no servidor.
  As Server Actions usam o cliente de servidor com a **anon key** e a sessão do
  usuário; o acesso é controlado por **RLS** (não usamos service key na app).
- Variáveis de ambiente em `.env.local` (fora do controle de versão):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Clientes Supabase (padrão `@supabase/ssr`):

- `lib/supabase/client.ts` — cliente de browser (componentes client).
- `lib/supabase/server.ts` — cliente de servidor (Server Components / Actions),
  lendo/gravando cookies.
- `lib/supabase/middleware.ts` — helper de atualização de sessão usado pelo
  `middleware.ts`.

## 4. Modelo de dados (Postgres / Supabase)

### Tabela `pecas`

| coluna | tipo | restrições |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `sku` | text | **único**, not null |
| `part_number` | text | not null |
| `descricao` | text | not null |
| `created_at` | timestamptz | default `now()` |
| `created_by` | uuid | ref. `auth.users(id)` |

### Tabela `pecas_anexos` (1 peça → N anexos)

| coluna | tipo | restrições |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `peca_id` | uuid | FK → `pecas(id)` **ON DELETE CASCADE**, not null |
| `tipo` | text | `check (tipo in ('foto','documento'))`, not null |
| `path` | text | caminho do arquivo no bucket, not null |
| `nome` | text | nome original do arquivo (exibido para documentos) |
| `mime_type` | text | |
| `tamanho` | bigint | bytes |
| `created_at` | timestamptz | default `now()` |
| `created_by` | uuid | ref. `auth.users(id)` |

Índice em `pecas_anexos(peca_id)` para listar anexos de uma peça.

### RLS (Row Level Security)

RLS **habilitado** em ambas as tabelas. Como o catálogo é compartilhado entre
usuários internos, as políticas concedem acesso a qualquer usuário
**autenticado**:

- `pecas`: `select`, `insert`, `update`, `delete` para `authenticated`.
- `pecas_anexos`: idem, para `authenticated`.
- `created_by` preenchido com `auth.uid()` na criação (default ou via Server
  Action).

## 5. Storage (Supabase Storage)

Dois buckets, separados por natureza do conteúdo:

- **`pecas-fotos`** — **público na leitura**. Exibição de galeria/thumbnails
  usa a URL pública direta (simples e rápido). Upload/exclusão apenas por
  usuário autenticado (políticas de Storage).
- **`pecas-documentos`** — **privado**. Download por **URL assinada** gerada no
  servidor (Server Action) no momento do clique. Upload/exclusão apenas por
  usuário autenticado.

Organização dos arquivos por peça: `pecas/{peca_id}/{uuid-do-arquivo}.{ext}`.

Ao **excluir uma peça**, os arquivos correspondentes são removidos dos buckets
(além do cascade que apaga as linhas de `pecas_anexos`). A remoção de um anexo
individual apaga o arquivo do bucket e a linha na tabela.

## 6. Rotas e navegação

Rotas:

- `/login` — pública. Formulário e-mail + senha.
- `/pecas` — protegida. Grade de cards das peças.
- `/pecas/nova` — protegida. Formulário de cadastro.
- `/pecas/[id]` — protegida. Detalhe da peça.
- `/pecas/[id]/editar` — protegida. Edição.

### Detalhe como modal com URL (Parallel + Intercepting Routes)

Padrão de "modal com rota" do Next.js App Router:

- `app/pecas/layout.tsx` define os slots `children` e `@modal`.
- `app/pecas/@modal/default.tsx` retorna `null` (sem modal por padrão).
- `app/pecas/@modal/(.)[id]/page.tsx` — **intercepta** a navegação
  `/pecas` → `/pecas/[id]` e renderiza o detalhe **dentro de um modal** sobre a
  lista, atualizando a URL para `/pecas/[id]`.
- `app/pecas/[id]/page.tsx` — página cheia do detalhe, usada em **acesso direto
  ou refresh** na URL `/pecas/[id]`.
- Fechar o modal volta para `/pecas` (`router.back()`), preservando o
  comportamento de histórico.

O conteúdo do detalhe (galeria de fotos + lista de documentos) é um componente
reutilizado tanto pelo modal quanto pela página cheia.

### Proteção de rotas

O `middleware.ts` aplica a todas as rotas exceto `/login` e assets: se não há
sessão válida, redireciona para `/login`. Após login bem-sucedido, redireciona
para `/pecas`.

## 7. Telas e componentes

- **Header** (em todas as telas protegidas): identidade do app, e-mail do
  usuário logado e botão **Sair**.
- **`/pecas` (lista):** grade responsiva de cards. Cada card mostra a **foto de
  capa** (primeira foto ou placeholder), SKU, part number, descrição resumida e
  **selos** com contagem de fotos e documentos. Botão **"Nova peça"** em
  destaque. Clique no card abre o modal de detalhe.
- **Detalhe (modal/página):** galeria de fotos com **lightbox** simples
  (navegar entre fotos), lista de documentos com nome/ícone/tamanho e botão de
  **download**, e ações **Editar** / **Excluir** (exclusão com confirmação).
- **Formulário (nova/editar):**
  - Campos: SKU, part number, descrição.
  - **Upload múltiplo de fotos** com preview em miniatura e remover individual.
  - **Upload de documentos** com lista (nome/ícone/tamanho) e remover individual.
  - Estados de loading durante upload e salvamento.

## 8. Direção visual — tema "peças / manutenção"

Paleta **análoga** em torno do laranja industrial (segurança/ferramentas), com
neutros de aço e suporte a modo claro/escuro:

- **Acento/CTA (trio análogo):** Âmbar `#f59e0b` → Laranja `#f97316` →
  Vermelho-telha `#ea580c`.
- **Neutros:** escala **slate/zinc** (cinza-aço) para fundos, textos e bordas.
- **Cards:** cantos arredondados, borda sutil e sombra leve.
- **Toques de oficina:** ícones de engrenagem/chave para SKU, part number e
  documentos; leve textura de grade (blueprint) no header.
- **Tipografia:** sans-serif limpa para texto; **monoespaçada** para os campos
  técnicos (SKU e part number).

A execução visual detalhada será feita na implementação com a skill
`frontend-design`. Esta seção define a direção.

## 9. Erros e validação

- Campos obrigatórios validados no formulário (SKU, part number, descrição).
- **SKU único**: violação de unicidade tratada com mensagem amigável
  ("SKU já cadastrado").
- Erros de login traduzidos ("E-mail ou senha inválidos").
- Feedback de loading e mensagens de erro claras em uploads e ações.
- Limites e tipos de arquivo aceitos definidos no formulário (ex.: imagens para
  fotos; PDF/office/imagens para documentos) — valores exatos definidos na
  implementação.

## 10. Testes e verificação

- Checagem de tipos com `tsc` / build do Next.
- Validação manual do fluxo completo:
  1. Login com usuário criado no painel.
  2. Cadastrar peça com múltiplas fotos e documentos.
  3. Ver na lista e abrir o detalhe (modal e via URL direta).
  4. Baixar um documento (URL assinada).
  5. Editar (trocar/remover fotos e documentos).
  6. Excluir peça (confirmar remoção de linhas e arquivos).
  7. Logout e verificação de que rotas protegidas redirecionam para `/login`.

## 11. Configuração de ambiente (setup)

Passos que dependem do painel Supabase (executados na implementação):

1. Criar as tabelas `pecas` e `pecas_anexos` e habilitar RLS + políticas (SQL).
2. Criar os buckets `pecas-fotos` (público) e `pecas-documentos` (privado) com
   políticas de upload/exclusão para autenticados.
3. Criar ao menos um usuário de teste (e-mail + senha) no painel de Auth.
4. Copiar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` para
   `.env.local`.
