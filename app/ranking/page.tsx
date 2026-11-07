import { obterRanking, periodoValido } from '@/lib/ranking'
import { perfilAtual } from '@/lib/perfil'
import { RankingView } from '@/components/ranking-view'

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const periodo = periodoValido((await searchParams).periodo)
  const [ranking, perfil] = await Promise.all([obterRanking(periodo), perfilAtual()])
  return <RankingView ranking={ranking} periodo={periodo} meuId={perfil?.userId ?? ''} />
}
