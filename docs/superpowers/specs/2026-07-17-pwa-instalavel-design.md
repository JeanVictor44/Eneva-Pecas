# PWA instalável (Catálogo de Peças)

**Data:** 2026-07-17
**Status:** Aprovado para implementação

## Problema

O app roda só no navegador. Não é instalável na tela inicial nem abre em janela própria
(standalone), e não tem manifest/ícones de app. Para uso em campo (celular/tablet), ter o
app na tela inicial com cara de aplicativo melhora bastante o acesso.

## Objetivo

Tornar o app **instalável** (PWA): manifest + ícones + `display: standalone` + theme color,
mais um prompt discreto que ajuda a instalar (inclusive a dica de iOS). **Sem** service
worker/offline e **sem** push notifications (decisão do usuário).

## Decisões tomadas

- **Nível: instalável.** Sem service worker, sem offline, sem push.
- **Ícones: placeholders gerados** — quadrado arredondado laranja da marca + glifo branco de
  caixa/pacote. Usuário troca por um logo real depois.
- **Prompt de instalação** discreto e dispensável, renderizado no layout raiz (aparece
  inclusive no login); some quando o app já está instalado.
- **Cores da marca (hex, derivadas do tema oklch):** primary/theme `#fc7101`, background
  `#ffffff`, foreground `#0a0a0a`.
- Remover os SVGs de template do create-next-app em `public/`.

## Notas técnicas confirmadas (Next 16)

- Manifest nativo via `app/manifest.ts` (`MetadataRoute.Manifest`), servido em
  `/manifest.webmanifest`.
- `themeColor` mora no `export const viewport: Viewport`, **não** no `metadata` (confirmado
  em `node_modules/next/dist/docs/.../generate-viewport.md`).
- `sharp` 0.34.5 disponível (`node_modules/@img/sharp-win32-x64`) → gera os PNGs a partir de
  um SVG.
- Instalabilidade precisa de manifest válido + HTTPS; o service worker NÃO é necessário para
  instalar (conforme o guia de PWA do Next).

## Componentes

### 1. Manifest — `app/manifest.ts` (novo)

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Catálogo de Peças',
    short_name: 'Peças',
    description: 'Cadastro e consulta de peças de manutenção',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#fc7101',
    lang: 'pt-BR',
    dir: 'ltr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
```

### 2. Ícones — `scripts/gen-icons.mjs` (novo) + `public/icons/*.png` (gerados)

- Script Node (ESM) que monta um SVG e usa `sharp` para rasterizar:
  - SVG "any" (glifo grande): fundo laranja `#fc7101`, cantos arredondados, glifo branco de
    caixa/pacote centralizado (~70% da área).
  - SVG "maskable": mesmo desenho, mas com o glifo dentro da **zona segura** (~60–70% central,
    fundo laranja sangrando até a borda) para não cortar em máscaras circulares.
- Saídas:
  - `public/icons/icon-192.png` (192×192, do SVG "any")
  - `public/icons/icon-512.png` (512×512, do SVG "any")
  - `public/icons/icon-maskable-512.png` (512×512, do SVG "maskable")
  - `public/icons/apple-icon-180.png` (180×180, do SVG "any"; fundo opaco laranja — iOS não
    usa transparência/máscara)
- O script é **commitado** (reprodutível) e **rodado uma vez**; os PNGs também são commitados.
- Adicionar um script npm opcional `"gen:icons": "node scripts/gen-icons.mjs"` para regerar.

### 3. Metadata + viewport — `app/layout.tsx` (modificado)

- Novo export:

```ts
import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#fc7101',
}
```

- Estender o `metadata` existente (mantendo `title`/`description`):

```ts
export const metadata: Metadata = {
  title: 'Catálogo de Peças',
  description: 'Cadastro e consulta de peças de manutenção',
  applicationName: 'Catálogo de Peças',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Peças',
  },
  icons: {
    apple: '/icons/apple-icon-180.png',
  },
}
```

- Renderizar `<InstallPrompt />` dentro do `<body>`, após `{children}`.

### 4. Prompt de instalação — `components/install-prompt.tsx` (novo)

Client component (`'use client'`), banner discreto fixo (rodapé), dispensável:

- Estado: `visivel`, `evento` (BeforeInstallPromptEvent | null), `isIOS`.
- `useEffect` no mount:
  - Se `window.matchMedia('(display-mode: standalone)').matches` OU
    `(navigator as any).standalone` → não renderiza (já instalado).
  - Se `localStorage.getItem('pwa-install-dismissed') === '1'` → não renderiza.
  - Detecta iOS (`/iPad|iPhone|iPod/.test(navigator.userAgent)` sem MSStream).
  - Registra listener de `beforeinstallprompt`: `e.preventDefault()`, guarda o evento, mostra
    o banner (Android/Chromium).
  - iOS: mostra o banner com a dica (não há `beforeinstallprompt`).
- Ações:
  - **Instalar** (quando há `evento`): `await evento.prompt()`, aguarda `userChoice`, esconde.
  - **Dispensar**: grava `localStorage['pwa-install-dismissed'] = '1'` e esconde.
- iOS: em vez do botão, texto "Toque em Compartilhar ⎋ e 'Adicionar à Tela de Início' ➕".
- Estilo: coerente com o tema (cartão claro, acento laranja, `z` alto, `max-w`, cantos
  arredondados; respeita `prefers-color-scheme` como o resto do app).
- Tipagem: declarar uma interface local `BeforeInstallPromptEvent` (não existe no lib.dom
  padrão) com `prompt(): Promise<void>` e `userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>`.

### 5. Limpeza

- Remover `public/next.svg`, `public/vercel.svg`, `public/globe.svg`, `public/file.svg`,
  `public/window.svg` (sobras do create-next-app, não referenciadas).

## Fora de escopo

- Service worker, cache offline, offline fallback.
- Push notifications (VAPID/web-push/subscriptions).
- Splash screens customizadas por dispositivo iOS (o iOS gera a partir do manifest/ícone).
- Analytics de instalação.

## Riscos / limitações (aceitos)

- **Sem service worker:** o `beforeinstallprompt` pode não disparar em alguns navegadores; nesse
  caso o usuário instala pelo menu do navegador ("Instalar app") e, no iOS, pela dica exibida.
  Instalabilidade básica (manifest + HTTPS) continua funcionando.
- **HTTPS obrigatório** para instalar: em `localhost` o Chrome trata como seguro para o
  manifest, mas o fluxo real de instalação/`beforeinstallprompt` é melhor testado em HTTPS
  (`next dev --experimental-https`) ou na URL publicada.
- Ícones são placeholders; trocar por logo real depois (basta regerar com o script).

## Verificação

- Sem test runner. Gates: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Rodar `node scripts/gen-icons.mjs` e conferir os 4 PNGs em `public/icons/`.
- Manual: `npm run build && npm start` (ou dev), abrir DevTools → Application → Manifest:
  sem erros, 3 ícones listados, "Installability" sem avisos bloqueantes; `/manifest.webmanifest`
  retorna o JSON esperado; o banner de instalação aparece (Chromium) / mostra a dica (iOS) e
  some após instalar/dispensar.

## Arquivos afetados

- `app/manifest.ts` (novo)
- `scripts/gen-icons.mjs` (novo)
- `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-icon-180.png` (novos, gerados)
- `app/layout.tsx` (viewport + metadata + render do InstallPrompt)
- `components/install-prompt.tsx` (novo)
- `package.json` (script opcional `gen:icons`)
- remoção de `public/{next,vercel,globe,file,window}.svg`
