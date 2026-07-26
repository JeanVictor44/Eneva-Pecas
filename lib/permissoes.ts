// Vocabulário de permissões. Sem imports de servidor — este módulo é importado
// tanto por Server Actions quanto por componentes client.

export const PERMISSOES = [
  'visualizar',
  'criar',
  'editar',
  'excluir',
  'gerir_usuarios',
] as const

export type Permissao = (typeof PERMISSOES)[number]

export type Permissoes = Record<Permissao, boolean>

export const ROTULOS: Record<Permissao, string> = {
  visualizar: 'Visualizar peças',
  criar: 'Criar peças',
  editar: 'Editar peças',
  excluir: 'Excluir peças',
  gerir_usuarios: 'Gerir usuários',
}

export const SEM_PERMISSOES: Permissoes = {
  visualizar: false,
  criar: false,
  editar: false,
  excluir: false,
  gerir_usuarios: false,
}

export const COLUNAS_PERFIL =
  'user_id, nome, ativo, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_gerir_usuarios'

export type LinhaPerfil = {
  user_id: string
  nome: string | null
  ativo: boolean
  pode_visualizar: boolean
  pode_criar: boolean
  pode_editar: boolean
  pode_excluir: boolean
  pode_gerir_usuarios: boolean
}

export function permissoesDaLinha(linha: LinhaPerfil): Permissoes {
  return {
    visualizar: linha.pode_visualizar,
    criar: linha.pode_criar,
    editar: linha.pode_editar,
    excluir: linha.pode_excluir,
    gerir_usuarios: linha.pode_gerir_usuarios,
  }
}

export function colunasDePermissoes(p: Permissoes) {
  return {
    pode_visualizar: p.visualizar,
    pode_criar: p.criar,
    pode_editar: p.editar,
    pode_excluir: p.excluir,
    pode_gerir_usuarios: p.gerir_usuarios,
  }
}
