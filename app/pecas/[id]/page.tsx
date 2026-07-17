import { notFound } from 'next/navigation'
import { buscarPeca } from '@/lib/pecas'
import { PecaDetalhe } from '@/components/peca-detalhe'

export default async function PecaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const peca = await buscarPeca(id)
  if (!peca) notFound()

  return (
    <div className="rounded-2xl border border-steel-200 bg-white p-6 dark:border-steel-700 dark:bg-steel-800">
      <PecaDetalhe peca={peca} />
    </div>
  )
}
