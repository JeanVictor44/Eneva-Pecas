import { listarPecas, listarCategorias } from '@/lib/pecas'
import { PecasView } from '@/components/pecas-view'

export default async function PecasPage() {
  const [pecas, categorias] = await Promise.all([listarPecas(), listarCategorias()])
  return <PecasView pecas={pecas} categorias={categorias} />
}
