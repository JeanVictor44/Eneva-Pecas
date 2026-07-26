# PWA instalável — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o Catálogo de Peças instalável como PWA — manifest + ícones + `display: standalone` + theme color + um prompt de instalação discreto (com dica de iOS). Sem service worker/offline e sem push.

**Architecture:** `app/manifest.ts` (manifest nativo do Next, servido em `/manifest.webmanifest`); ícones PNG gerados com `sharp` a partir de um SVG e servidos de `public/icons/`; `themeColor` via `export const viewport`; um client component `InstallPrompt` renderizado no layout raiz.

**Tech Stack:** Next.js 16 (App Router, Metadata/Viewport API), React 19, `sharp` 0.34.5, Tailwind v4, lucide-react.

## Global Constraints

- **AGENTS.md:** "This is NOT the Next.js you know." Fatos já confirmados na doc embarcada: manifest = `app/manifest.ts` (`MetadataRoute.Manifest`); `themeColor` vive em `export const viewport: Viewport` (NÃO no `metadata`); instalabilidade precisa de manifest + HTTPS (service worker não é obrigatório).
- **Sem framework de testes.** Verificação por tarefa: `npx tsc --noEmit` e/ou `npm run lint`. Gate final: `npm run build` verde + checklist manual. Não introduzir test runner.
- **Escopo: instalável apenas.** NÃO criar service worker, cache offline, nem push notifications.
- **Cores da marca (hex):** theme/primary `#fc7101`, background `#ffffff`, foreground `#0a0a0a`.
- **Textos/idioma:** pt-BR. `name` = "Catálogo de Peças", `short_name` = "Peças".
- **Commits são opcionais** — o usuário prefere não commitar docs de planejamento; commite o código de implementação na branch de feature.
- **Ícones:** placeholders (quadrado laranja + glifo branco de pacote), gerados via `sharp`.

---

## File Structure

- `scripts/gen-icons.mjs` — gera os PNGs dos ícones com sharp. (Task 1)
- `public/icons/*.png` — ícones gerados (192/512/maskable-512/apple-180). (Task 1)
- `package.json` — script `gen:icons`; remoção de SVGs de template. (Task 1)
- `app/manifest.ts` — manifest do PWA. (Task 2)
- `components/install-prompt.tsx` — prompt de instalação (client). (Task 3)
- `app/layout.tsx` — `viewport` + metadata (manifest/apple) + render do `<InstallPrompt/>`. (Task 4)

---

## Task 1: Ícones (sharp) + housekeeping de assets

**Files:**
- Create: `scripts/gen-icons.mjs`
- Create (geradas): `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/icons/apple-icon-180.png`
- Modify: `package.json`
- Delete: `public/next.svg`, `public/vercel.svg`, `public/globe.svg`, `public/file.svg`, `public/window.svg`

**Interfaces:**
- Produces: os 4 PNGs em `public/icons/` que o manifest (Task 2) e o layout (Task 4) referenciam.

- [ ] **Step 1: Criar `scripts/gen-icons.mjs`**

```js
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ORANGE = '#fc7101'
const WHITE = '#ffffff'

// Glifo "package" do lucide (viewBox 24x24, baseado em strokes).
const LUCIDE_PACKAGE = `
    <path d="M16.5 9.4 7.55 4.24"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <path d="M3.29 7 12 12l8.71-5"/>
    <path d="M12 22V12"/>
`

// Monta um SVG 512x512: fundo laranja + glifo branco centralizado.
// glyphRatio = fração da largura ocupada pelo glifo; rounded = cantos arredondados.
function iconSvg({ glyphRatio, rounded }) {
  const S = 512
  const g = S * glyphRatio
  const scale = g / 24
  const off = (S - g) / 2
  const strokeW = (S * 0.035) / scale // ~18px de traço visual, expresso no espaço 24
  const rx = rounded ? 96 : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="${rx}" fill="${ORANGE}"/>
  <g transform="translate(${off} ${off}) scale(${scale})" fill="none" stroke="${WHITE}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round">
${LUCIDE_PACKAGE}
  </g>
</svg>`
}

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'icons')
await mkdir(outDir, { recursive: true })

// "any": glifo maior + cantos arredondados. "maskable": glifo menor (zona segura) + fundo cheio.
// "apple": fundo cheio (iOS não gosta de transparência nos cantos) + glifo padrão.
const anySvg = Buffer.from(iconSvg({ glyphRatio: 0.5, rounded: true }))
const maskableSvg = Buffer.from(iconSvg({ glyphRatio: 0.42, rounded: false }))
const appleSvg = Buffer.from(iconSvg({ glyphRatio: 0.5, rounded: false }))

async function png(svg, size, file) {
  await sharp(svg).resize(size, size).png().toFile(join(outDir, file))
  console.log('gerado:', file)
}

await png(anySvg, 192, 'icon-192.png')
await png(anySvg, 512, 'icon-512.png')
await png(maskableSvg, 512, 'icon-maskable-512.png')
await png(appleSvg, 180, 'apple-icon-180.png')
console.log('OK — 4 ícones gerados em public/icons/')
```

- [ ] **Step 2: Rodar o script e gerar os PNGs**

Run: `node scripts/gen-icons.mjs`
Expected: imprime "gerado:" para os 4 arquivos e "OK". Cria `public/icons/` com os 4 PNGs.

- [ ] **Step 3: Verificar dimensões dos PNGs**

Run:
```bash
node -e "const s=require('sharp');(async()=>{for(const f of ['icon-192.png','icon-512.png','icon-maskable-512.png','apple-icon-180.png']){const m=await s('public/icons/'+f).metadata();console.log(f,m.width+'x'+m.height,m.format)}})()"
```
Expected:
```
icon-192.png 192x192 png
icon-512.png 512x512 png
icon-maskable-512.png 512x512 png
apple-icon-180.png 180x180 png
```

- [ ] **Step 4: Adicionar script npm `gen:icons`**

Em `package.json`, no bloco `"scripts"`, adicionar (após `"lint"`):

```json
    "lint": "eslint",
    "gen:icons": "node scripts/gen-icons.mjs"
```

- [ ] **Step 5: Ignorar `scripts/` no ESLint** (é ferramenta de build com globais de Node, não código do app)

Em `eslint.config.mjs`, acrescentar `"scripts/**"` ao array de `globalIgnores([...])`:

```js
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
  ]),
```

- [ ] **Step 6: Remover SVGs de template não usados**

Antes de remover, confirmar que não são referenciados:
Run: `git grep -nE "next\\.svg|vercel\\.svg|globe\\.svg|file\\.svg|window\\.svg" -- ':!docs' || echo "sem referências"`
Expected: "sem referências".

Então remover:
```bash
git rm public/next.svg public/vercel.svg public/globe.svg public/file.svg public/window.svg
```

- [ ] **Step 7: Lint (sanity)**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 8 (opcional): Commit**

```bash
git add scripts/gen-icons.mjs public/icons package.json eslint.config.mjs
git commit -m "feat(pwa): gera ícones (sharp) + remove svgs de template"
```

---

## Task 2: Manifest do PWA

**Files:**
- Create: `app/manifest.ts`

**Interfaces:**
- Consumes: os ícones de `public/icons/` (Task 1).
- Produces: `/manifest.webmanifest` (Next serve automaticamente a partir de `app/manifest.ts`).

- [ ] **Step 1: Criar `app/manifest.ts`**

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

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 (opcional): Commit**

```bash
git add app/manifest.ts
git commit -m "feat(pwa): manifest do app (standalone, ícones, theme)"
```

---

## Task 3: Componente de prompt de instalação

**Files:**
- Create: `components/install-prompt.tsx`

**Interfaces:**
- Consumes: `@/components/ui/button`.
- Produces: `InstallPrompt` (export nomeado) — renderizado pelo layout na Task 4.

- [ ] **Step 1: Criar `components/install-prompt.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// beforeinstallprompt não existe no lib.dom padrão — tipagem local.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const CHAVE_DISPENSA = 'pwa-install-dismissed'

export function InstallPrompt() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    // Já instalado (standalone) → nunca mostra.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return
    if (localStorage.getItem(CHAVE_DISPENSA) === '1') return

    const ios =
      /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream
    setIsIOS(ios)
    if (ios) {
      setVisivel(true) // iOS não dispara beforeinstallprompt; mostra a dica.
      return
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setEvento(e as BeforeInstallPromptEvent)
      setVisivel(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  function dispensar() {
    localStorage.setItem(CHAVE_DISPENSA, '1')
    setVisivel(false)
  }

  async function instalar() {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    setEvento(null)
    setVisivel(false)
  }

  if (!visivel) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Download className="size-5" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          {isIOS ? (
            <p className="text-foreground/80">
              Para instalar, toque em Compartilhar{' '}
              <Share className="inline size-3.5 align-[-2px]" /> e depois “Adicionar à Tela de
              Início”.
            </p>
          ) : (
            <p className="font-medium text-foreground">Instalar o app na tela inicial</p>
          )}
        </div>
        {!isIOS && (
          <Button type="button" size="sm" onClick={instalar}>
            Instalar
          </Button>
        )}
        <button
          type="button"
          onClick={dispensar}
          aria-label="Dispensar"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos + lint**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npm run lint`
Expected: PASS (confirmar que `Download`, `Share`, `X` e `Button` estão todos usados).

- [ ] **Step 3 (opcional): Commit**

```bash
git add components/install-prompt.tsx
git commit -m "feat(pwa): prompt de instalação (Chromium + dica iOS)"
```

---

## Task 4: Layout — viewport + metadata + render do InstallPrompt + verificação final

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `InstallPrompt` (Task 3), `/manifest.webmanifest` (Task 2), `public/icons/apple-icon-180.png` (Task 1).

- [ ] **Step 1: Reescrever `app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { InstallPrompt } from "@/components/install-prompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Catálogo de Peças",
  description: "Cadastro e consulta de peças de manutenção",
  applicationName: "Catálogo de Peças",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Peças",
  },
  icons: {
    apple: "/icons/apple-icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#fc7101",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verificação de tipos + lint (gate)**

Run: `npx tsc --noEmit`
Expected: PASS — zero erros.
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Build (gate final)**

Run: `npm run build`
Expected: build conclui sem erros (o aviso pré-existente `middleware`→`proxy` é esperado e não relacionado). Confirmar na saída que a rota `/manifest.webmanifest` é gerada.

- [ ] **Step 4: Smoke test manual** (`npm run dev`, ou melhor `npm run build && npm start`)

1. Abrir `http://localhost:3000/manifest.webmanifest` → retorna o JSON com `name`, `display: "standalone"`, `theme_color: "#fc7101"` e os 3 ícones.
2. DevTools → Application → **Manifest**: sem erros; 3 ícones listados; nenhum aviso bloqueante de instalabilidade (num contexto seguro).
3. `<head>` inclui `<link rel="manifest" href="/manifest.webmanifest">`, `<meta name="theme-color" content="#fc7101">` e `<link rel="apple-touch-icon" href="/icons/apple-icon-180.png">`.
4. Banner de instalação: no Chromium desktop/Android aparece "Instalar o app…" com botão (quando o navegador julga instalável); dispensar guarda em `localStorage` e não reaparece; instalar abre o diálogo nativo.
5. (iOS Safari) o banner mostra a dica de Compartilhar → Adicionar à Tela de Início.

> Observação: o fluxo real de instalação/`beforeinstallprompt` só é confiável em **HTTPS**
> (`next dev --experimental-https`) ou na URL publicada — o controlador/usuário faz esse
> teste no dispositivo. O gate automatizado aqui é tsc + lint + build + o JSON do manifest.

- [ ] **Step 5 (opcional): Commit**

```bash
git add app/layout.tsx
git commit -m "feat(pwa): manifest/theme/apple no layout + prompt de instalação"
```

---

## Self-Review (cobertura do spec)

- **Manifest `app/manifest.ts` (standalone, cores, ícones)** → Task 2. ✓
- **Ícones placeholders via sharp (192/512/maskable/apple-180)** → Task 1. ✓
- **Script `gen:icons` + limpeza de SVGs de template** → Task 1. ✓
- **`viewport` com `themeColor` + metadata (manifest/appleWebApp/apple icon)** → Task 4. ✓
- **`InstallPrompt` (Chromium `beforeinstallprompt` + dica iOS, dispensável, some se instalado)** → Task 3, renderizado na Task 4. ✓
- **Sem service worker/offline/push** — não implementado. ✓
- **Riscos aceitos (sem SW → prompt best-effort; HTTPS p/ instalar; ícones placeholder)** — refletidos no smoke test/observações. ✓
