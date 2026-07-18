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
