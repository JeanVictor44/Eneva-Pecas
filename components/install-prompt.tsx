'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// beforeinstallprompt não existe no lib.dom padrão — tipagem local.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const CHAVE_DISPENSA = 'pwa-install-dismissed'

// `montado` é true só no cliente (após hidratar) e false no servidor / durante a
// hidratação. Com useSyncExternalStore evitamos acessar window/navigator no SSR,
// sem mismatch de hidratação e sem setState síncrono dentro de efeito.
const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

function useMontado(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function InstallPrompt() {
  const montado = useMontado()
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)
  const [dispensado, setDispensado] = useState(false)

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setEvento(e as BeforeInstallPromptEvent)
    }
    // Instalado pelo menu do navegador (não pelo nosso botão): esconde o banner.
    function onInstalled() {
      setEvento(null)
      setDispensado(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Fatos do ambiente: lidos só quando montado (cliente), nunca no SSR.
  let standalone = false
  let isIOS = false
  let jaDispensado = false
  if (montado) {
    standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    const nav = window.navigator as unknown as {
      userAgent: string
      platform?: string
      maxTouchPoints?: number
    }
    isIOS =
      (/iPad|iPhone|iPod/.test(nav.userAgent) ||
        // iPadOS 13+ se apresenta como desktop (MacIntel + toque)
        (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1)) &&
      !(window as unknown as { MSStream?: unknown }).MSStream
    jaDispensado = localStorage.getItem(CHAVE_DISPENSA) === '1'
  }

  // Mostra quando: montado, não instalado, não dispensado, e (iOS ou o navegador
  // sinalizou que dá pra instalar via beforeinstallprompt).
  const visivel =
    montado && !standalone && !dispensado && !jaDispensado && (isIOS || evento !== null)

  function dispensar() {
    localStorage.setItem(CHAVE_DISPENSA, '1')
    setDispensado(true)
  }

  async function instalar() {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    setEvento(null) // esconde o banner após o diálogo nativo (aceito ou recusado)
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
