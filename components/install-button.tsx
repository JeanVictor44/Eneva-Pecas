'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// beforeinstallprompt não existe no lib.dom padrão — tipagem local.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// `montado` é true só no cliente (após hidratar); false no servidor / durante a
// hidratação. Evita acessar window/navigator no SSR, sem mismatch de hidratação.
const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

function useMontado(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function InstallButton() {
  const montado = useMontado()
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)
  const [instalado, setInstalado] = useState(false)
  const [instrucoes, setInstrucoes] = useState(false)

  useEffect(() => {
    // Melhoria progressiva: no Chromium o navegador emite este evento e nós o
    // guardamos para disparar a instalação nativa de 1 clique.
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setEvento(e as BeforeInstallPromptEvent)
    }
    // Instalado (pelo nosso botão ou pelo menu do navegador): esconde o botão.
    function onInstalled() {
      setEvento(null)
      setInstalado(true)
      setInstrucoes(false)
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
  }

  // Não renderiza antes de montar (evita flash) nem se o app já está instalado.
  if (!montado || standalone || instalado) return null

  async function instalar() {
    if (evento) {
      // Chromium: dispara o prompt nativo de instalação.
      await evento.prompt()
      await evento.userChoice
      setEvento(null)
    } else {
      // iOS / Firefox / evento ainda não disponível: mostra as instruções manuais.
      setInstrucoes(true)
    }
  }

  return (
    <>
      <Button type="button" size="sm" onClick={instalar}>
        <Download />
        Instalar
      </Button>

      <Dialog open={instrucoes} onOpenChange={setInstrucoes}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Instalar o app</DialogTitle>
            <DialogDescription>
              {isIOS
                ? 'No iPhone/iPad a instalação é feita pelo Safari.'
                : 'Seu navegador instala pelo próprio menu.'}
            </DialogDescription>
          </DialogHeader>
          {isIOS ? (
            <p className="text-sm text-foreground/80">
              Toque em Compartilhar{' '}
              <Share className="inline size-4 align-[-3px]" /> na barra do Safari e depois em{' '}
              <strong>&quot;Adicionar à Tela de Início&quot;</strong>.
            </p>
          ) : (
            <p className="text-sm text-foreground/80">
              Abra o menu do navegador (⋮) e escolha <strong>&quot;Instalar app&quot;</strong> ou{' '}
              <strong>&quot;Adicionar à tela inicial&quot;</strong>. Se a opção não aparecer,
              confirme que o site está em HTTPS.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
