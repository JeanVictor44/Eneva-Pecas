import Link from 'next/link'
import { Medal, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PERIODOS,
  ROTULOS_PERIODO,
  type Periodo,
  type PosicaoRanking,
  type Ranking,
} from '@/lib/ranking'

// Cores por posição no pódio (1º ouro, 2º prata, 3º bronze).
const ESTILO_PODIO: Record<number, { medalha: string; base: string; altura: string }> = {
  1: {
    medalha: 'bg-amber-400 text-amber-950',
    base: 'bg-amber-400/15 ring-amber-400/50',
    altura: 'sm:pt-10',
  },
  2: {
    medalha: 'bg-steel-300 text-steel-800',
    base: 'bg-steel-200/50 ring-steel-300',
    altura: 'sm:pt-6',
  },
  3: {
    medalha: 'bg-orange-700 text-orange-50',
    base: 'bg-orange-700/10 ring-orange-700/30',
    altura: 'sm:pt-3',
  },
}

function pecas(n: number) {
  return `${n} ${n === 1 ? 'peça' : 'peças'}`
}

function Voce({ ativo }: { ativo: boolean }) {
  if (!ativo) return null
  return <span className="ml-1.5 text-xs font-normal text-muted-foreground">(você)</span>
}

function CartaoPodio({ item, meuId }: { item: PosicaoRanking; meuId: string }) {
  const estilo = ESTILO_PODIO[item.posicao] ?? ESTILO_PODIO[3]
  const Icone = item.posicao === 1 ? Trophy : Medal
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl px-4 pb-5 pt-5 text-center ring-1',
        estilo.base,
        estilo.altura,
      )}
    >
      <span
        className={cn(
          'grid size-12 place-items-center rounded-full shadow-sm',
          estilo.medalha,
        )}
      >
        <Icone className="size-6" />
      </span>
      <span className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {item.posicao}º lugar
      </span>
      <p className="mt-1 w-full truncate font-semibold text-foreground" title={item.nome}>
        {item.nome}
        <Voce ativo={item.userId === meuId} />
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{item.total}</p>
      <p className="text-xs text-muted-foreground">{item.total === 1 ? 'peça' : 'peças'}</p>
    </div>
  )
}

export function RankingView({
  ranking,
  periodo,
  meuId,
}: {
  ranking: Ranking
  periodo: Periodo
  meuId: string
}) {
  const { posicoes, totalPecas, semAutor } = ranking
  const podio = posicoes.slice(0, 3)
  const lider = posicoes[0]?.total ?? 0
  // No desktop o pódio fica 2º · 1º · 3º; no celular, na ordem natural.
  const ordemDesktop = ['sm:order-2', 'sm:order-1', 'sm:order-3']

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Ranking de cadastros
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quem mais cadastrou peças no catálogo: {pecas(totalPecas)}{' '}
            {periodo === 'total' ? 'no total' : `· ${ROTULOS_PERIODO[periodo].toLowerCase()}`}.
          </p>
        </div>

        <nav
          aria-label="Período"
          className="inline-flex w-fit rounded-lg bg-muted p-1 text-sm"
        >
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={p === 'total' ? '/ranking' : `/ranking?periodo=${p}`}
              aria-current={p === periodo ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium transition-colors',
                p === periodo
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {ROTULOS_PERIODO[p]}
            </Link>
          ))}
        </nav>
      </div>

      {posicoes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <Trophy className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">Nenhuma peça cadastrada no período.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            O ranking aparece assim que a primeira peça for cadastrada.
          </p>
        </div>
      ) : (
        <>
          <section
            aria-label="Pódio"
            className="mb-10 grid grid-cols-1 items-end gap-4 sm:grid-cols-3"
          >
            {podio.map((item, i) => (
              <div key={item.userId} className={ordemDesktop[i]}>
                <CartaoPodio item={item} meuId={meuId} />
              </div>
            ))}
          </section>

          <section aria-label="Classificação completa">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Classificação</h2>
            <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {posicoes.map((item) => {
                const meu = item.userId === meuId
                return (
                  <li
                    key={item.userId}
                    className={cn('flex items-center gap-4 px-4 py-3', meu && 'bg-primary/5')}
                  >
                    <span
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums',
                        ESTILO_PODIO[item.posicao]?.medalha ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      {item.posicao}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground" title={item.nome}>
                        {item.nome}
                        <Voce ativo={meu} />
                      </p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${lider ? (item.total / lider) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {pecas(item.total)}
                    </span>
                  </li>
                )
              })}
            </ol>
            {semAutor > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {pecas(semAutor)} sem autor registrado {semAutor === 1 ? 'ficou' : 'ficaram'} de
                fora do ranking.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
