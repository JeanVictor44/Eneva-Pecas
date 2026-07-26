import { listarUsuarios } from '@/lib/usuarios'
import { perfilAtual } from '@/lib/perfil'
import { UsuariosView } from '@/components/usuarios-view'

export default async function UsuariosPage() {
  const [usuarios, perfil] = await Promise.all([listarUsuarios(), perfilAtual()])
  return <UsuariosView usuarios={usuarios} meuId={perfil?.userId ?? ''} />
}
