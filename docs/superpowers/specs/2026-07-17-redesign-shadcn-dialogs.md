# Redesign — shadcn + tela única com dialogs

- **Data:** 2026-07-17
- **Status:** Aprovado (revisão do design original após feedback do usuário)
- Substitui a camada de UI do plano `2026-07-17-catalogo-pecas.md`. A camada de dados,
  autenticação, Supabase e schema permanecem.

## Feedback que originou este redesign
> "Aprimorar o layout para shadcn e deixar todas as telas mais bonitas. Tudo em uma
> tela só com o modal. O fundo deve ser branco, sem esse azul estranho."

Decisões:
- **shadcn/ui** como biblioteca de componentes.
- **Uma tela só:** `/pecas` é a única tela (além de `/login`). Cadastrar, ver e editar
  peça acontecem em **Dialogs do shadcn** na própria lista (estado no cliente).
- **Sem rotas separadas de modal:** removidas `/pecas/nova`, `/pecas/[id]`,
  `/pecas/[id]/editar` e o slot parallel-route `@modal` (com `default.tsx` e `(.)[id]`),
  além de `components/modal.tsx`.
- **Tema claro apenas, fundo branco** com neutros de cinza (não slate/azul). Acento
  laranja de manutenção como `--primary` do shadcn.

## Tema
- shadcn base **neutral**, **somente tema claro** (sem dark mode).
- `--background: branco`; `--foreground` neutro escuro; `--primary` = laranja `#f97316`
  (com `--primary-foreground` branco); `--ring` = laranja; `--radius` ~0.65rem.
- Tokens legados `steel-*` são **remapeados para cinza neutro** (escala `neutral` do
  Tailwind) para eliminar o azul sem reescrever cada classe; `brand-*` (âmbar→laranja→
  telha) permanece para acentos. O `body` usa fundo branco; remover a media query dark.

## Componentes shadcn usados
`button`, `dialog`, `card`, `input`, `label`, `textarea`, `badge`, e `sonner` (toasts de
feedback de sucesso/erro). Instalados via `npx shadcn@latest` em `components/ui/`.

## Arquitetura da tela única
- `app/pecas/page.tsx` (server): `listarPecas()` → renderiza `<PecasView pecas={...} />`.
- `components/pecas-view.tsx` (client): orquestra o estado dos dialogs
  (`modo: null | 'nova' | 'detalhe' | 'editar'`, peça selecionada). Renderiza:
  - Cabeçalho da lista com botão **"Nova peça"** (abre dialog de cadastro).
  - Grade de `<PecaCard>` (shadcn `Card`), clique abre o dialog de **detalhe**.
  - `Dialog` de cadastro/edição (usa `PecaForm`) e `Dialog` de detalhe (usa `PecaDetalhe`).
  - Após sucesso de criar/editar/excluir: fecha o dialog e `router.refresh()`.
- Detalhe/edição precisam dos dados completos da peça (fotos + URLs assinadas de
  documentos): carregados sob demanda via server action `carregarPeca(id)`.

## Mudanças nas Server Actions (`app/pecas/actions.ts`)
- `EstadoPeca = { erro: string | null; ok: boolean }`.
- `criarPeca` e `atualizarPeca`: em vez de `redirect(...)`, fazem `revalidatePath('/pecas')`
  e **retornam** `{ erro: null, ok: true }`; o cliente fecha o dialog e dá refresh.
- `excluirPeca(id)`: `revalidatePath('/pecas')` e retorna `{ erro: null, ok: true }`
  (sem redirect); cliente fecha e atualiza.
- **Nova:** `carregarPeca(id): Promise<PecaDetalheData | null>` — wrapper server-side de
  `buscarPeca` para abrir detalhe/edição no cliente.
- Regras de negócio (validação, cleanup de anexos órfãos, scoping por `peca_id`,
  buckets, `mapErro`) permanecem inalteradas.

## O que NÃO muda
- `lib/supabase/*`, `middleware.ts`, `lib/pecas.ts` (leitura), `lib/erros.ts`,
  `lib/storage.ts`, `lib/tipos.ts`, schema/RLS/buckets, login/logout.

## Verificação
- `npx tsc --noEmit` + `npm run build`. Sem testes automatizados (decisão do projeto).
- Verificação visual manual do usuário (login → lista → nova → detalhe → editar → excluir).
