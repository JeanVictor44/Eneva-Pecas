'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, PackagePlus, Plus } from 'lucide-react'
import {
  criarPeca,
  atualizarPeca,
  excluirPeca,
  carregarPeca,
} from '@/app/pecas/actions'
import type { PecaLista, PecaDetalheData } from '@/lib/pecas'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PecaCard } from './peca-card'
import { PecaForm } from './peca-form'
import { PecaDetalhe } from './peca-detalhe'

type Modo = 'nova' | 'detalhe' | 'editar' | null

export function PecasView({ pecas }: { pecas: PecaLista[] }) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>(null)
  const [pecaSel, setPecaSel] = useState<PecaDetalheData | null>(null)
  const [carregando, startTransition] = useTransition()

  function abrirDetalhe(id: string) {
    setPecaSel(null)
    setModo('detalhe')
    startTransition(async () => {
      const data = await carregarPeca(id)
      setPecaSel(data)
    })
  }

  function fechar() {
    setModo(null)
  }

  function aoSucesso(mensagem: string) {
    setModo(null)
    setPecaSel(null)
    router.refresh()
    toast.success(mensagem)
  }

  async function excluir() {
    if (!pecaSel) return
    const r = await excluirPeca(pecaSel.id)
    if (r.ok) aoSucesso('Peça excluída.')
    else toast.error(r.erro ?? 'Não foi possível excluir a peça.')
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Peças</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pecas.length === 0
              ? 'Nenhuma peça cadastrada.'
              : `${pecas.length} ${pecas.length === 1 ? 'peça cadastrada' : 'peças cadastradas'}.`}
          </p>
        </div>
        <Button size="lg" onClick={() => setModo('nova')}>
          <Plus />
          Nova peça
        </Button>
      </div>

      {pecas.length === 0 ? (
        <div className="grid place-items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <PackagePlus className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Comece seu catálogo</p>
            <p className="text-sm text-muted-foreground">
              Cadastre a primeira peça com fotos e documentos.
            </p>
          </div>
          <Button size="lg" onClick={() => setModo('nova')}>
            <Plus />
            Nova peça
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pecas.map((p) => (
            <PecaCard key={p.id} peca={p} onClick={() => abrirDetalhe(p.id)} />
          ))}
        </div>
      )}

      {/* Nova peça */}
      <Dialog open={modo === 'nova'} onOpenChange={(aberto) => !aberto && fechar()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova peça</DialogTitle>
            <DialogDescription>
              Cadastre uma peça com SKU, part number e anexos.
            </DialogDescription>
          </DialogHeader>
          <PecaForm
            action={criarPeca}
            onSuccess={() => aoSucesso('Peça cadastrada.')}
            submitLabel="Cadastrar"
          />
        </DialogContent>
      </Dialog>

      {/* Detalhe */}
      <Dialog open={modo === 'detalhe'} onOpenChange={(aberto) => !aberto && fechar()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {pecaSel ? (
            <PecaDetalhe
              peca={pecaSel}
              onEditar={() => setModo('editar')}
              onExcluir={excluir}
            />
          ) : (
            <div className="grid min-h-40 place-items-center">
              <DialogTitle className="sr-only">
                {carregando ? 'Carregando peça' : 'Peça não encontrada'}
              </DialogTitle>
              {carregando ? (
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-sm text-muted-foreground">Peça não encontrada.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={modo === 'editar'} onOpenChange={(aberto) => !aberto && fechar()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar peça</DialogTitle>
            {pecaSel && (
              <DialogDescription className="font-mono">{pecaSel.sku}</DialogDescription>
            )}
          </DialogHeader>
          {pecaSel && (
            <PecaForm
              action={atualizarPeca.bind(null, pecaSel.id)}
              peca={pecaSel}
              onSuccess={() => aoSucesso('Alterações salvas.')}
              submitLabel="Salvar"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
