import { listarPecas } from '@/lib/pecas'
import { PecasView } from '@/components/pecas-view'

export default async function PecasPage() {
  const pecas = await listarPecas()
  return <PecasView pecas={pecas} />
}
