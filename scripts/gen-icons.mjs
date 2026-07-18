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
