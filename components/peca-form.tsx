'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import type { EstadoPeca } from '@/app/pecas/actions'
import type { PecaDetalheData } from '@/lib/pecas'

type AcaoForm = (state: EstadoPeca, formData: FormData) => Promise<EstadoPeca>
const inicial: EstadoPeca = { erro: null }

export function PecaForm({
  action,
  titulo,
  peca,
}: {
  action: AcaoForm
  titulo: string
  peca?: PecaDetalheData
}) {
  const [state, formAction, pending] = useActionState(action, inicial)
  const [previews, setPreviews] = useState<string[]>([])
  const [docsNomes, setDocsNomes] = useState<string[]>([])
  const [removidos, setRemovidos] = useState<string[]>([])

  // Limpa object URLs ao trocar seleção / desmontar
  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u))
  }, [previews])

  const fotosExistentes = (peca?.fotos ?? []).filter((f) => !removidos.includes(f.id))
  const docsExistentes = (peca?.documentos ?? []).filter((d) => !removidos.includes(d.id))

  const inputCls =
    'w-full rounded-lg border border-steel-300 px-3 py-2 outline-none focus:border-brand-600 dark:bg-steel-900'

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-steel-800 dark:text-steel-100">{titulo}</h1>

      {state?.erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.erro}</p>
      )}

      <div className="space-y-1">
        <label htmlFor="sku" className="text-sm font-medium">SKU</label>
        <input id="sku" name="sku" required defaultValue={peca?.sku}
          className={`${inputCls} font-mono`} />
      </div>

      <div className="space-y-1">
        <label htmlFor="part_number" className="text-sm font-medium">Part number (fabricante)</label>
        <input id="part_number" name="part_number" required defaultValue={peca?.part_number}
          className={`${inputCls} font-mono`} />
      </div>

      <div className="space-y-1">
        <label htmlFor="descricao" className="text-sm font-medium">Descrição</label>
        <textarea id="descricao" name="descricao" required rows={3} defaultValue={peca?.descricao}
          className={inputCls} />
      </div>

      {fotosExistentes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Fotos atuais</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {fotosExistentes.map((f) => (
              <div key={f.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.nome ?? ''} className="h-24 w-full rounded-lg object-cover" />
                <button type="button" onClick={() => setRemovidos((r) => [...r, f.id])}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white">
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="fotos" className="text-sm font-medium">Adicionar fotos</label>
        <input id="fotos" name="fotos" type="file" multiple accept="image/*"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            setPreviews(files.map((f) => URL.createObjectURL(f)))
          }}
          className="block w-full text-sm" />
        {previews.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {previews.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={u} alt="" className="h-24 w-full rounded-lg object-cover" />
            ))}
          </div>
        )}
      </div>

      {docsExistentes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Documentos atuais</p>
          <ul className="space-y-1">
            {docsExistentes.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg border border-steel-200 px-3 py-2 text-sm dark:border-steel-700">
                <span>📄 {d.nome}</span>
                <button type="button" onClick={() => setRemovidos((r) => [...r, d.id])}
                  className="text-brand-700 hover:underline">
                  remover
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="documentos" className="text-sm font-medium">Adicionar documentos</label>
        <input id="documentos" name="documentos" type="file" multiple
          onChange={(e) => setDocsNomes(Array.from(e.target.files ?? []).map((f) => f.name))}
          className="block w-full text-sm" />
        {docsNomes.length > 0 && (
          <ul className="mt-2 text-xs text-steel-500">
            {docsNomes.map((n, i) => <li key={i}>📄 {n}</li>)}
          </ul>
        )}
      </div>

      {removidos.map((id) => (
        <input key={id} type="hidden" name="remover" value={id} />
      ))}

      <div className="flex gap-3">
        <button type="submit" disabled={pending}
          className="rounded-lg bg-brand-600 px-5 py-2 font-medium text-white transition hover:bg-brand-700 disabled:opacity-60">
          {pending ? 'Salvando...' : 'Salvar'}
        </button>
        <Link href="/pecas" className="rounded-lg border border-steel-300 px-5 py-2 font-medium text-steel-700 hover:bg-steel-100 dark:border-steel-600 dark:text-steel-200">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
