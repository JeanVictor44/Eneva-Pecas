import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { perfilAtual } from '@/lib/perfil'
import {
  COLUNAS_PERFIL,
  SEM_PERMISSOES,
  permissoesDaLinha,
  type LinhaPerfil,
  type Permissoes,
} from '@/lib/permissoes'

export type UsuarioLista = {
  userId: string
  email: string
  nome: string | null
  ativo: boolean
  permissoes: Permissoes
}

export async function listarUsuarios(): Promise<UsuarioLista[]> {
  // A service role key ignora RLS, então a checagem tem que estar aqui — o guard
  // do layout não protege uma função chamável de qualquer ponto do servidor.
  const eu = await perfilAtual()
  if (!eu?.permissoes.gerir_usuarios) {
    throw new Error('Sem permissão para listar usuários.')
  }

  // Os e-mails vivem em auth.users, que não é legível via PostgREST — só pela
  // Admin API.
  const admin = createAdminClient()
  const usuariosAuth: { id: string; email?: string }[] = []
  let pagina = 1
  // listUsers pagina; sem o laço, quem cai fora da primeira página fica invisível
  // na tela — e, como a lista é a única origem do userId, intocável.
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 })
    if (error) throw error
    usuariosAuth.push(...data.users)
    if (!data.nextPage) break
    pagina = data.nextPage
  }

  // Os perfis vêm pelo cliente normal, sujeitos ao RLS (o gestor pode ler todos).
  const supabase = await createClient()
  const { data, error } = await supabase.from('perfis').select(COLUNAS_PERFIL)
  if (error) throw error

  const perfis = new Map(
    ((data ?? []) as LinhaPerfil[]).map((p) => [p.user_id, p]),
  )

  return usuariosAuth
    .map((u) => {
      const p = perfis.get(u.id)
      return {
        userId: u.id,
        email: u.email ?? '',
        nome: p?.nome ?? null,
        ativo: p?.ativo ?? false,
        permissoes: p ? permissoesDaLinha(p) : SEM_PERMISSOES,
      }
    })
    .sort((a, b) =>
      (a.nome ?? a.email).localeCompare(b.nome ?? b.email, 'pt-BR'),
    )
}
