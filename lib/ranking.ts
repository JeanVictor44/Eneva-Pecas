import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { perfilAtual } from '@/lib/perfil'

export const PERIODOS = ['total', 'ano', 'mes'] as const
export type Periodo = (typeof PERIODOS)[number]

export const ROTULOS_PERIODO: Record<Periodo, string> = {
  total: 'Todo o período',
  ano: 'Este ano',
  mes: 'Este mês',
}

export function periodoValido(valor: unknown): Periodo {
  return PERIODOS.includes(valor as Periodo) ? (valor as Periodo) : 'total'
}

export type PosicaoRanking = {
  posicao: number
  userId: string
  nome: string
  total: number
}

export type Ranking = {
  posicoes: PosicaoRanking[]
  totalPecas: number
  semAutor: number
}

// Início do período no fuso de Brasília. O Brasil não tem horário de verão desde
// 2019, então o offset fixo -03:00 é exato.
function inicioDoPeriodo(periodo: Periodo): string | null {
  if (periodo === 'total') return null
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const ano = partes.find((p) => p.type === 'year')!.value
  const mes = periodo === 'mes' ? partes.find((p) => p.type === 'month')!.value : '01'
  return `${ano}-${mes}-01T00:00:00-03:00`
}

export async function obterRanking(periodo: Periodo): Promise<Ranking> {
  // O cliente admin ignora RLS; a checagem tem que estar aqui, não só no layout.
  const eu = await perfilAtual()
  if (!eu?.permissoes.visualizar) {
    throw new Error('Sem permissão para ver o ranking.')
  }

  // As peças vêm pelo cliente normal, sujeitas ao RLS de 'visualizar'. A contagem
  // é feita aqui: agregações via PostgREST ficam desligadas por padrão no Supabase.
  const supabase = await createClient()
  let consulta = supabase.from('pecas').select('created_by')
  const inicio = inicioDoPeriodo(periodo)
  if (inicio) consulta = consulta.gte('created_at', inicio)
  const { data, error } = await consulta
  if (error) throw error

  const contagem = new Map<string, number>()
  let semAutor = 0
  for (const p of (data ?? []) as { created_by: string | null }[]) {
    if (!p.created_by) {
      semAutor++
      continue
    }
    contagem.set(p.created_by, (contagem.get(p.created_by) ?? 0) + 1)
  }

  const ids = [...contagem.keys()]
  const nomes = await nomesDosUsuarios(ids)

  const ordenados = ids
    .map((userId) => ({
      userId,
      nome: nomes.get(userId) ?? 'Usuário removido',
      total: contagem.get(userId)!,
    }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'))

  // Empates dividem a posição (1, 1, 3).
  const posicoes: PosicaoRanking[] = []
  ordenados.forEach((u, i) => {
    const anterior = posicoes[i - 1]
    const posicao = anterior && anterior.total === u.total ? anterior.posicao : i + 1
    posicoes.push({ ...u, posicao })
  })

  return { posicoes, totalPecas: (data ?? []).length, semAutor }
}

// O RLS de perfis só deixa o gestor ler os perfis dos outros, e os e-mails só saem
// pela Admin API. Por isso o cliente admin — e só nome/e-mail deixam esta função.
async function nomesDosUsuarios(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  if (ids.length === 0) return nomes

  const admin = createAdminClient()
  const { data, error } = await admin.from('perfis').select('user_id, nome').in('user_id', ids)
  if (error) throw error
  for (const p of (data ?? []) as { user_id: string; nome: string | null }[]) {
    if (p.nome?.trim()) nomes.set(p.user_id, p.nome.trim())
  }

  const semNome = ids.filter((id) => !nomes.has(id))
  const usuarios = await Promise.all(semNome.map((id) => admin.auth.admin.getUserById(id)))
  usuarios.forEach(({ data: u }, i) => {
    if (u.user?.email) nomes.set(semNome[i], u.user.email)
  })

  return nomes
}
