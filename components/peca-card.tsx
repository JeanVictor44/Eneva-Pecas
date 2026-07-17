import Link from 'next/link'
import type { PecaLista } from '@/lib/pecas'

export function PecaCard({ peca }: { peca: PecaLista }) {
  return (
    <Link
      href={`/pecas/${peca.id}`}
      className="group block overflow-hidden rounded-2xl border border-steel-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-steel-700 dark:bg-steel-800"
    >
      <div className="aspect-[4/3] bg-steel-100 dark:bg-steel-700">
        {peca.capaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={peca.capaUrl} alt={peca.sku} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-steel-400">sem foto</div>
        )}
      </div>
      <div className="p-4">
        <p className="font-mono text-sm font-semibold text-brand-700">{peca.sku}</p>
        <p className="font-mono text-xs text-steel-500">{peca.part_number}</p>
        <p className="mt-1 line-clamp-2 text-sm text-steel-700 dark:text-steel-300">
          {peca.descricao}
        </p>
        <div className="mt-3 flex gap-3 text-xs text-steel-500">
          <span>📷 {peca.qtdFotos}</span>
          <span>📄 {peca.qtdDocs}</span>
        </div>
      </div>
    </Link>
  )
}
