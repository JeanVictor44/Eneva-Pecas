'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapErro } from '@/lib/erros'
import { exigir, perfilAtual } from '@/lib/perfil'
import { PERMISSOES, colunasDePermissoes, type Permissoes } from '@/lib/permissoes'

export type EstadoUsuario = { erro: string | null; ok: boolean }

const SENHA_MINIMA = 8

// Checkbox desmarcado não é enviado pelo browser: presença do campo = marcado.
function permissoesDoForm(formData: FormData): Permissoes {
  return Object.fromEntries(
    PERMISSOES.map((p) => [p, formData.get(`perm_${p}`) !== null]),
  ) as Permissoes
}

export async function criarUsuario(
  _prev: EstadoUsuario,
  formData: FormData,
): Promise<EstadoUsuario> {
  const erroPermissao = await exigir('gerir_usuarios')
  if (erroPermissao) return { erro: erroPermissao, ok: false }

  const nome = String(formData.get('nome') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const senha = String(formData.get('senha') ?? '')
  const permissoes = permissoesDoForm(formData)

  if (!nome) return { erro: 'Informe o nome.', ok: false }
  if (!email) return { erro: 'Informe o e-mail.', ok: false }
  if (nome.length > 120) return { erro: 'O nome é longo demais.', ok: false }
  if (email.length > 254) return { erro: 'O e-mail é longo demais.', ok: false }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { erro: 'Informe um e-mail válido.', ok: false }
  }
  if (senha.length < SENHA_MINIMA) {
    return { erro: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`, ok: false }
  }

  const admin = createAdminClient()
  // email_confirm: true — o usuário já entra liberado, sem e-mail de confirmação.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (error) {
    const jaExiste =
      error.code === 'email_exists' ||
      /already (been )?registered|already exists/i.test(error.message)
    if (jaExiste) return { erro: 'Este e-mail já tem cadastro.', ok: false }
    console.error('Falha ao criar usuário:', error.message)
    return { erro: 'Não foi possível criar o usuário. Tente novamente.', ok: false }
  }

  const { error: erroPerfil } = await admin.from('perfis').insert({
    user_id: data.user.id,
    nome,
    ativo: true,
    ...colunasDePermissoes(permissoes),
  })
  if (erroPerfil) {
    // Compensação: sem perfil o login não serve para nada, então desfaz a criação.
    const { error: erroLimpeza } = await admin.auth.admin.deleteUser(data.user.id)
    if (erroLimpeza) {
      console.error('Falha ao remover usuário órfão:', data.user.id, erroLimpeza.message)
      return {
        erro: `O perfil não foi salvo e o login criado não pôde ser removido (${email}). Edite esse usuário na lista para completar o cadastro.`,
        ok: false,
      }
    }
    return { erro: mapErro(erroPerfil), ok: false }
  }

  revalidatePath('/usuarios')
  return { erro: null, ok: true }
}

export async function atualizarUsuario(
  userId: string,
  _prev: EstadoUsuario,
  formData: FormData,
): Promise<EstadoUsuario> {
  const erroPermissao = await exigir('gerir_usuarios')
  if (erroPermissao) return { erro: erroPermissao, ok: false }

  const nome = String(formData.get('nome') ?? '').trim()
  const ativo = formData.get('ativo') !== null
  const permissoes = permissoesDoForm(formData)

  if (!nome) return { erro: 'Informe o nome.', ok: false }
  if (nome.length > 120) return { erro: 'O nome é longo demais.', ok: false }

  const eu = await perfilAtual()

  // Travas 1 e 2: ninguém se rebaixa nem se desativa sozinho.
  if (eu?.userId === userId) {
    if (!permissoes.gerir_usuarios) {
      return { erro: 'Você não pode remover a sua própria permissão de gerir usuários.', ok: false }
    }
    if (!ativo) {
      return { erro: 'Você não pode desativar o seu próprio acesso.', ok: false }
    }
  }

  const supabase = await createClient()

  // Invariante "sempre ao menos um gestor ativo": não dá para checar aqui de forma
  // atômica (dois gestores se rebaixando ao mesmo tempo passariam os dois pela
  // checagem). Quem garante isso é o trigger `perfis_garantir_gestor_ativo` no
  // banco (docs/supabase/setup.sql).
  const { data: atualizado, error } = await supabase
    .from('perfis')
    .upsert(
      {
        user_id: userId,
        nome,
        ativo,
        ...colunasDePermissoes(permissoes),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('user_id')
  if (error) {
    // 23503 = foreign_key_violation: o login não existe mais em auth.users.
    if (error.code === '23503') {
      return { erro: 'Este usuário não existe mais. Atualize a página.', ok: false }
    }
    return { erro: mapErro(error), ok: false }
  }
  if (!atualizado?.length) {
    return { erro: 'Não foi possível salvar: o perfil não foi encontrado ou você perdeu a permissão.', ok: false }
  }

  revalidatePath('/usuarios')
  return { erro: null, ok: true }
}

export async function redefinirSenha(
  userId: string,
  _prev: EstadoUsuario,
  formData: FormData,
): Promise<EstadoUsuario> {
  const erroPermissao = await exigir('gerir_usuarios')
  if (erroPermissao) return { erro: erroPermissao, ok: false }

  const senha = String(formData.get('senha') ?? '')
  if (senha.length < SENHA_MINIMA) {
    return { erro: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`, ok: false }
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: senha })
  if (error) {
    if (error.code === 'weak_password' || /password/i.test(error.message)) {
      return {
        erro: 'A senha foi recusada pelo Supabase — ele pode exigir uma senha mais longa ou mais forte que a mínima do formulário.',
        ok: false,
      }
    }
    if (error.code === 'user_not_found') {
      return { erro: 'Este usuário não existe mais. Atualize a página.', ok: false }
    }
    console.error('Falha ao redefinir senha:', userId, error.message)
    return { erro: 'Não foi possível redefinir a senha. Tente novamente.', ok: false }
  }

  return { erro: null, ok: true }
}
