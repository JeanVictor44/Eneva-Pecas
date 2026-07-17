import Link from 'next/link'
import { listarPecas } from '@/lib/pecas'
import { PecaCard } from '@/components/peca-card'

export default async function PecasPage() {
  const pecas = await listarPecas()

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-steel-800 dark:text-steel-100">Peças</h1>
        <Link
          href="/pecas/nova"
          className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition hover:bg-brand-700"
        >
          + Nova peça
        </Link>
      </div>

      {pecas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-steel-300 p-12 text-center text-steel-500">
          Nenhuma peça cadastrada ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pecas.map((p) => (
            <PecaCard key={p.id} peca={p} />
          ))}
        </div>
      )}
    </div>
  )
}
