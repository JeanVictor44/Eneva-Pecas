import { ImageIcon, FileText, ImageOff } from 'lucide-react'
import type { PecaLista } from '@/lib/pecas'

export function PecaCard({
  peca,
  onClick,
}: {
  peca: PecaLista
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl bg-card text-left ring-1 ring-foreground/10 transition-all outline-none hover:-translate-y-0.5 hover:ring-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {peca.capaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={peca.capaUrl}
            alt={peca.sku}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <ImageOff className="size-8" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-baseline gap-2">
          <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            SKU
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-primary">
            {peca.sku}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Part number
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/70">
            {peca.part_number}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{peca.descricao}</p>

        <div className="mt-auto flex items-center gap-4 pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="size-3.5" />
            {peca.qtdFotos}
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="size-3.5" />
            {peca.qtdDocs}
          </span>
        </div>
      </div>
    </button>
  )
}
