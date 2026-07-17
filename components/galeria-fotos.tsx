'use client'

import { useState } from 'react'
import type { AnexoComUrl } from '@/lib/pecas'

export function GaleriaFotos({ fotos }: { fotos: AnexoComUrl[] }) {
  const [aberto, setAberto] = useState<number | null>(null)

  if (fotos.length === 0) {
    return <p className="text-sm text-steel-400">Sem fotos.</p>
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.map((f, i) => (
          <button key={f.id} onClick={() => setAberto(i)} className="overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={f.nome ?? 'foto'} className="h-24 w-full object-cover transition hover:scale-105" />
          </button>
        ))}
      </div>

      {aberto !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setAberto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotos[aberto].url} alt="" className="max-h-[85vh] max-w-full rounded-lg" />
        </div>
      )}
    </>
  )
}
