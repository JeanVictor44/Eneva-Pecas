import { notFound } from 'next/navigation'
import { buscarPeca } from '@/lib/pecas'
import { PecaDetalhe } from '@/components/peca-detalhe'
import { Modal } from '@/components/modal'

export default async function PecaModalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const peca = await buscarPeca(id)
  if (!peca) notFound()

  return (
    <Modal>
      <PecaDetalhe peca={peca} />
    </Modal>
  )
}
