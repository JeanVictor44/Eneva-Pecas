import { notFound } from 'next/navigation'
import { buscarPeca } from '@/lib/pecas'
import { PecaForm } from '@/components/peca-form'
import { atualizarPeca } from '../../actions'

export default async function EditarPecaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const peca = await buscarPeca(id)
  if (!peca) notFound()

  const action = atualizarPeca.bind(null, id)
  return <PecaForm action={action} titulo="Editar peça" peca={peca} />
}
