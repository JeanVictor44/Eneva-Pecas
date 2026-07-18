'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// beforeinstallprompt não existe no lib.dom padrão — tipagem local.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const CHAVE_DISPENSA = 'pwa-install-dismissed'

export function InstallPrompt() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)
  const [visivel, setVisivel] = useState(() => {
    // Já instalado (standalone) → nunca mostra.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return false
    if (localStorage.getItem(CHAVE_DISPENSA) === '1') return false

    const ios =
      /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream
    return ios // iOS mostra dica imediatamente
  })

  const isIOS =
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream

  useEffect(() => {
    // Já instalado ou iOS: não precisa de listener
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      isIOS
    ) {
      return
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setEvento(e as BeforeInstallPromptEvent)
      setVisivel(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [isIOS])

  function dispensar() {
    localStorage.setItem(CHAVE_DISPENSA, '1')
    setVisivel(false)
  }

  async function instalar() {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    setEvento(null)
    setVisivel(false)
  }

  if (!visivel) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Download className="size-5" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          {isIOS ? (
            <p className="text-foreground/80">
              Para instalar, toque em Compartilhar{' '}
              <Share className="inline size-3.5 align-[-2px]" /> e depois &quot;Adicionar à Tela de
              Início&quot;.
            </p>
          ) : (
            <p className="font-medium text-foreground">Instalar o app na tela inicial</p>
          )}
        </div>
        {!isIOS && (
          <Button type="button" size="sm" onClick={instalar}>
            Instalar
          </Button>
        )}
        <button
          type="button"
          onClick={dispensar}
          aria-label="Dispensar"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
