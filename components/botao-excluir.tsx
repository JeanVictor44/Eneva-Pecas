'use client'

import { useState } from 'react'
import { excluirPeca } from '@/app/pecas/actions'

export function BotaoExcluir({ id }: { id: string }) {
  const [confirmando, setConfirmando] = useState(false)

  if (!confirmando) {
    return (
      <button onClick={() => setConfirmando(true)}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
        Excluir
      </button>
    )
  }

  return (
    <form action={excluirPeca.bind(null, id)} className="inline-flex items-center gap-2">
      <span className="text-sm text-steel-600">Confirmar exclusão?</span>
      <button type="submit"
        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">
        Sim, excluir
      </button>
      <button type="button" onClick={() => setConfirmando(false)}
        className="rounded-lg border border-steel-300 px-3 py-2 text-sm">
        Cancelar
      </button>
    </form>
  )
}
