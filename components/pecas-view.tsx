'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, PackagePlus, Plus, Search, SearchX } from 'lucide-react'
import {
  criarPeca,
  atualizarPeca,
  excluirPeca,
  carregarPeca,
} from '@/app/pecas/actions'
import type { PecaLista, PecaDetalheData } from '@/lib/pecas'
import type { Categoria } from '@/lib/tipos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

// Normaliza para busca insensível a maiúsculas e acentos.
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function PecasView({
  pecas,
  categorias,
}: {
  pecas: PecaLista[]
  categorias: Categoria[]
}) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>(null)
  const [pecaSel, setPecaSel] = useState<PecaDetalheData | null>(null)
  const [carregando, startTransition] = useTransition()
  const [busca, setBusca] = useState('')
  const reqRef = useRef(0)

  const pecasFiltradas = useMemo(() => {
    const q = normalizar(busca.trim())
    if (!q) return pecas
    return pecas.filter(
      (p) =>
        normalizar(p.descricao).includes(q) ||
        p.referencias.some(
          (r) =>
            normalizar(r.sku).includes(q) ||
            normalizar(r.part_number).includes(q) ||
            normalizar(r.fabricante).includes(q),
        ),
    )
  }, [pecas, busca])

  function abrirDetalhe(id: string) {
    const req = ++reqRef.current
    setPecaSel(null)
    setModo('detalhe')
    startTransition(async () => {
      const data = await carregarPeca(id)
      if (reqRef.current === req) setPecaSel(data)
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
              : busca.trim()
                ? `${pecasFiltradas.length} de ${pecas.length} ${pecas.length === 1 ? 'peça' : 'peças'}.`
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
        <>
          <div className="relative mb-6">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por SKU, part number, fabricante ou descrição…"
              aria-label="Buscar peças"
              className="pl-9"
            />
          </div>

          {pecasFiltradas.length === 0 ? (
            <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
              <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
                <SearchX className="size-6" />
              </div>
              <p className="text-sm text-muted-foreground">
                Nenhuma peça encontrada para “{busca}”.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pecasFiltradas.map((p) => (
                <PecaCard key={p.id} peca={p} onClick={() => abrirDetalhe(p.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Nova peça */}
      <Dialog open={modo === 'nova'} onOpenChange={(aberto) => !aberto && fechar()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova peça</DialogTitle>
            <DialogDescription>
              Cadastre uma peça com descrição, trincas (fabricante · SKU · part number) e anexos.
            </DialogDescription>
          </DialogHeader>
          <PecaForm
            action={criarPeca}
            categorias={categorias}
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
              <DialogDescription className="font-mono">
                {pecaSel.referencias[0]?.sku}
              </DialogDescription>
            )}
          </DialogHeader>
          {pecaSel && (
            <PecaForm
              action={atualizarPeca.bind(null, pecaSel.id)}
              peca={pecaSel}
              categorias={categorias}
              onSuccess={() => aoSucesso('Alterações salvas.')}
              submitLabel="Salvar"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
