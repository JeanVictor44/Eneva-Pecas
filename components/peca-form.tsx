'use client'

import { useActionState, useEffect, useState } from 'react'
import { FileText, ImagePlus, Paperclip, X } from 'lucide-react'
import type { EstadoPeca } from '@/app/pecas/actions'
import type { PecaDetalheData } from '@/lib/pecas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'

type AcaoForm = (state: EstadoPeca, formData: FormData) => Promise<EstadoPeca>

export function PecaForm({
  action,
  peca,
  onSuccess,
  submitLabel = 'Salvar',
}: {
  action: AcaoForm
  peca?: PecaDetalheData
  onSuccess: () => void
  submitLabel?: string
}) {
  const [state, formAction, pending] = useActionState<EstadoPeca, FormData>(action, {
    erro: null,
    ok: false,
  })
  const [previews, setPreviews] = useState<string[]>([])
  const [docsNomes, setDocsNomes] = useState<string[]>([])
  const [removidos, setRemovidos] = useState<string[]>([])

  // Fecha o dialog e atualiza a lista quando a ação conclui com sucesso.
  useEffect(() => {
    if (state.ok) onSuccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok])

  // Libera os object URLs de preview ao trocar seleção / desmontar.
  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u))
  }, [previews])

  const fotosExistentes = (peca?.fotos ?? []).filter((f) => !removidos.includes(f.id))
  const docsExistentes = (peca?.documentos ?? []).filter((d) => !removidos.includes(d.id))

  return (
    <form action={formAction} className="space-y-5">
      {state.erro && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.erro}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="sku">SKU</Label>
        <Input id="sku" name="sku" required defaultValue={peca?.sku} className="font-mono" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="part_number">Part number (fabricante)</Label>
        <Input
          id="part_number"
          name="part_number"
          required
          defaultValue={peca?.part_number}
          className="font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" required rows={3} defaultValue={peca?.descricao} />
      </div>

      {fotosExistentes.length > 0 && (
        <div className="space-y-2">
          <Label>Fotos atuais</Label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {fotosExistentes.map((f) => (
              <div key={f.id} className="relative overflow-hidden rounded-lg ring-1 ring-foreground/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.nome ?? ''} className="h-24 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setRemovidos((r) => [...r, f.id])}
                  aria-label="Remover foto"
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="fotos" className="cursor-pointer">
          <ImagePlus className="size-4 text-muted-foreground" />
          Adicionar fotos
        </Label>
        <Input
          id="fotos"
          name="fotos"
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => setPreviews(Array.from(e.target.files ?? []).map((f) => URL.createObjectURL(f)))}
          className="h-auto py-1.5"
        />
        {previews.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {previews.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={u}
                alt=""
                className="h-24 w-full rounded-lg object-cover ring-1 ring-foreground/10"
              />
            ))}
          </div>
        )}
      </div>

      {docsExistentes.length > 0 && (
        <div className="space-y-2">
          <Label>Documentos atuais</Label>
          <ul className="space-y-1.5">
            {docsExistentes.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                <button
                  type="button"
                  onClick={() => setRemovidos((r) => [...r, d.id])}
                  className="shrink-0 text-sm font-medium text-destructive hover:underline"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="documentos" className="cursor-pointer">
          <Paperclip className="size-4 text-muted-foreground" />
          Adicionar documentos
        </Label>
        <Input
          id="documentos"
          name="documentos"
          type="file"
          multiple
          onChange={(e) => setDocsNomes(Array.from(e.target.files ?? []).map((f) => f.name))}
          className="h-auto py-1.5"
        />
        {docsNomes.length > 0 && (
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {docsNomes.map((n, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <FileText className="size-3" />
                {n}
              </li>
            ))}
          </ul>
        )}
      </div>

      {removidos.map((id) => (
        <input key={id} type="hidden" name="remover" value={id} />
      ))}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
          Cancelar
        </DialogClose>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Salvando…' : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
