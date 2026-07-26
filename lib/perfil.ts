import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  COLUNAS_PERFIL,
  SEM_PERMISSOES,
  permissoesDaLinha,
  type LinhaPerfil,
  type Permissao,
  type Permissoes,
} from '@/lib/permissoes'

export type PerfilAtual = {
  userId: string
  email: string
  nome: string | null
  ativo: boolean
  permissoes: Permissoes
}

const ACOES: Record<Permissao, string> = {
  visualizar: 'visualizar peças',
  criar: 'cadastrar peças',
  editar: 'editar peças',
  excluir: 'excluir peças',
  gerir_usuarios: 'gerir usuários',
}

// cache() do React deduplica por requisição: exigir() + perfilAtual() na mesma
// Server Action fazem uma leitura só, e as duas não podem discordar entre si.
export const perfilAtual = cache(async (): Promise<PerfilAtual | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('perfis')
    .select(COLUNAS_PERFIL)
    .eq('user_id', user.id)
    .maybeSingle<LinhaPerfil>()

  const email = user.email ?? ''

  // Login sem linha em perfis (ex.: criado direto no painel do Supabase) não tem
  // permissão nenhuma. O RLS já pensa assim; aqui o app concorda com ele.
  if (!data) {
    return { userId: user.id, email, nome: null, ativo: false, permissoes: SEM_PERMISSOES }
  }

  return {
    userId: user.id,
    email,
    nome: data.nome,
    ativo: data.ativo,
    permissoes: data.ativo ? permissoesDaLinha(data) : SEM_PERMISSOES,
  }
})

// Devolve a mensagem de erro quando falta a permissão, ou null quando está liberado.
export async function exigir(permissao: Permissao): Promise<string | null> {
  const perfil = await perfilAtual()
  if (!perfil) return 'Sessão expirada. Entre novamente.'
  if (!perfil.ativo) return 'Seu acesso está desativado. Fale com um administrador.'
  if (!perfil.permissoes[permissao]) {
    return `Você não tem permissão para ${ACOES[permissao]}.`
  }
  return null
}
