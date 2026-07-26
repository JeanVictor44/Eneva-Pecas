import { listarPecas, listarCategorias } from '@/lib/pecas'
import { perfilAtual } from '@/lib/perfil'
import { SEM_PERMISSOES } from '@/lib/permissoes'
import { PecasView } from '@/components/pecas-view'

export default async function PecasPage() {
  const [pecas, categorias, perfil] = await Promise.all([
    listarPecas(),
    listarCategorias(),
    perfilAtual(),
  ])
  return (
    <PecasView
      pecas={pecas}
      categorias={categorias}
      permissoes={perfil?.permissoes ?? SEM_PERMISSOES}
    />
  )
}
