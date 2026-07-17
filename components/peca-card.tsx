import { ImageIcon, FileText, ImageOff } from 'lucide-react'
import type { PecaLista } from '@/lib/pecas'
import { Badge } from '@/components/ui/badge'

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
            alt={peca.referencias[0]?.sku ?? peca.descricao}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <ImageOff className="size-8" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        {peca.categoria && (
          <Badge variant="secondary" className="mb-1">
            {peca.categoria.nome}
          </Badge>
        )}
        <div className="space-y-1">
          {peca.referencias.map((r, i) => (
            <div key={i} className="flex items-baseline gap-2 text-xs">
              <span className="min-w-0 max-w-[40%] shrink-0 truncate font-medium text-foreground/70">
                {r.fabricante}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono font-semibold text-primary">
                {r.sku}
              </span>
              <span className="min-w-0 max-w-[40%] shrink-0 truncate font-mono text-foreground/60">
                {r.part_number}
              </span>
            </div>
          ))}
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
