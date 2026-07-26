import Link from 'next/link'
import { ShieldOff, Users } from 'lucide-react'
import { perfilAtual } from '@/lib/perfil'
import { LogoutButton } from '@/components/logout-button'
import { Button } from '@/components/ui/button'

export default async function SemAcessoPage() {
  const perfil = await perfilAtual()
  const desativado = perfil !== null && !perfil.ativo

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="grid max-w-sm place-items-center gap-4 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
          <ShieldOff className="size-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">
            {desativado ? 'Acesso desativado' : 'Sem acesso'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {desativado
              ? 'Sua conta foi desativada. Fale com um administrador para reativá-la.'
              : 'Sua conta não tem permissão para acessar o catálogo. Peça a um administrador para liberar seu acesso.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* Saída para o gestor que perdeu 'visualizar': ele ainda pode se reabilitar. */}
          {perfil?.permissoes.gerir_usuarios && (
            <Button render={<Link href="/usuarios" />} variant="outline">
              <Users />
              Ir para Usuários
            </Button>
          )}
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}
