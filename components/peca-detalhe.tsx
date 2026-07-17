import Link from 'next/link'
import type { PecaDetalheData } from '@/lib/pecas'
import { GaleriaFotos } from './galeria-fotos'
import { BotaoExcluir } from './botao-excluir'

function formatarTamanho(bytes: number | null): string {
  if (!bytes) return ''
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

export function PecaDetalhe({ peca }: { peca: PecaDetalheData }) {
  return (
    <article className="space-y-6">
      <div>
        <p className="font-mono text-lg font-semibold text-brand-700">{peca.sku}</p>
        <p className="font-mono text-sm text-steel-500">{peca.part_number}</p>
        <p className="mt-2 text-steel-700 dark:text-steel-300">{peca.descricao}</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-steel-500">Fotos</h2>
        <GaleriaFotos fotos={peca.fotos} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-steel-500">Documentos</h2>
        {peca.documentos.length === 0 ? (
          <p className="text-sm text-steel-400">Sem documentos.</p>
        ) : (
          <ul className="space-y-1">
            {peca.documentos.map((d) => (
              <li key={d.id}>
                <a href={d.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg border border-steel-200 px-3 py-2 text-sm hover:bg-steel-50 dark:border-steel-700 dark:hover:bg-steel-800">
                  <span>📄 {d.nome}</span>
                  <span className="text-xs text-steel-400">{formatarTamanho(d.tamanho)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-3 border-t border-steel-200 pt-4 dark:border-steel-700">
        <Link href={`/pecas/${peca.id}/editar`}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Editar
        </Link>
        <BotaoExcluir id={peca.id} />
      </div>
    </article>
  )
}
