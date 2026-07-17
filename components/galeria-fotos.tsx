'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { AnexoComUrl } from '@/lib/pecas'

export function GaleriaFotos({ fotos }: { fotos: AnexoComUrl[] }) {
  const [aberto, setAberto] = useState<number | null>(null)

  if (fotos.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem fotos.</p>
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.map((f, i) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setAberto(i)}
            className="overflow-hidden rounded-lg ring-1 ring-foreground/10 transition-all outline-none hover:ring-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.url}
              alt={f.nome ?? 'foto'}
              className="h-24 w-full object-cover transition-transform duration-300 hover:scale-105"
            />
          </button>
        ))}
      </div>

      {aberto !== null &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAberto(null)
            }}
          >
            <button
              type="button"
              onClick={() => setAberto(null)}
              aria-label="Fechar"
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-white/10 text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="size-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fotos[aberto].url}
              alt={fotos[aberto].nome ?? ''}
              className="max-h-[85vh] max-w-full rounded-lg shadow-2xl"
            />
          </div>,
          document.body,
        )}
    </>
  )
}
