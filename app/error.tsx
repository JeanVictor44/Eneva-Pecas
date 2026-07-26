'use client'

import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="grid max-w-md place-items-center gap-4 text-center">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">Algo deu errado</h1>
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar esta página.
          </p>
        </div>
        {error.message && (
          <p className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-left font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
        )}
        <Button type="button" onClick={reset}>
          <RotateCw />
          Tentar de novo
        </Button>
      </div>
    </div>
  )
}
