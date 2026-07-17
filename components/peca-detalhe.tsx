'use client'

import { useState } from 'react'
import { Download, FileText, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { PecaDetalheData } from '@/lib/pecas'
import { Button } from '@/components/ui/button'
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { GaleriaFotos } from './galeria-fotos'

function formatarTamanho(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return ''
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

export function PecaDetalhe({
  peca,
  onEditar,
  onExcluir,
}: {
  peca: PecaDetalheData
  onEditar: () => void
  onExcluir: () => void | Promise<void>
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  async function confirmarExclusao() {
    setExcluindo(true)
    try {
      await onExcluir()
    } catch {
      toast.error('Não foi possível excluir a peça.')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-mono text-lg text-primary">{peca.sku}</DialogTitle>
        <DialogDescription className="font-mono">{peca.part_number}</DialogDescription>
      </DialogHeader>

      <p className="text-sm text-foreground/80">{peca.descricao}</p>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fotos
        </h3>
        <GaleriaFotos fotos={peca.fotos} />
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Documentos
        </h3>
        {peca.documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem documentos.</p>
        ) : (
          <ul className="space-y-1.5">
            {peca.documentos.map((d) => (
              <li key={d.id}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-muted"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatarTamanho(d.tamanho)}
                  </span>
                  <Download className="size-4 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DialogFooter className="sm:justify-between">
        {confirmando ? (
          <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
            <span className="self-center text-sm text-muted-foreground">Confirmar exclusão?</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmando(false)}
                disabled={excluindo}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmarExclusao}
                disabled={excluindo}
              >
                <Trash2 />
                {excluindo ? 'Excluindo…' : 'Sim, excluir'}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="destructive" onClick={() => setConfirmando(true)}>
            <Trash2 />
            Excluir
          </Button>
        )}

        {!confirmando && (
          <Button type="button" variant="default" size="lg" onClick={onEditar}>
            <Pencil />
            Editar
          </Button>
        )}
      </DialogFooter>
    </>
  )
}
