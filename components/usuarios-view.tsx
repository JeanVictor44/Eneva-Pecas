'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, UserRound, UserRoundX } from 'lucide-react'
import { criarUsuario, atualizarUsuario } from '@/app/usuarios/actions'
import type { UsuarioLista } from '@/lib/usuarios'
import { PERMISSOES, ROTULOS } from '@/lib/permissoes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UsuarioForm } from './usuario-form'
import { RedefinirSenha } from './redefinir-senha'

type Modo = 'novo' | 'editar' | null

export function UsuariosView({
  usuarios,
  meuId,
}: {
  usuarios: UsuarioLista[]
  meuId: string
}) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>(null)
  const [selecionado, setSelecionado] = useState<UsuarioLista | null>(null)

  function aoSucesso(mensagem: string) {
    setModo(null)
    setSelecionado(null)
    router.refresh()
    toast.success(mensagem)
  }

  function editar(u: UsuarioLista) {
    setSelecionado(u)
    setModo('editar')
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Usuários</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {usuarios.length} {usuarios.length === 1 ? 'usuário' : 'usuários'}.
          </p>
        </div>
        <Button size="lg" onClick={() => setModo('novo')}>
          <Plus />
          Novo usuário
        </Button>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {usuarios.map((u) => (
          <li key={u.userId}>
            <button
              type="button"
              onClick={() => editar(u)}
              className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="flex items-start gap-3">
                <span
                  className={
                    u.ativo
                      ? 'grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'
                      : 'grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground'
                  }
                >
                  {u.ativo ? <UserRound className="size-4" /> : <UserRoundX className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {u.nome ?? u.email}
                    {u.userId === meuId && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                </div>
                {!u.ativo && <Badge variant="destructive">Inativo</Badge>}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {PERMISSOES.filter((p) => u.permissoes[p]).map((p) => (
                  <Badge key={p} variant="secondary">
                    {ROTULOS[p]}
                  </Badge>
                ))}
                {PERMISSOES.every((p) => !u.permissoes[p]) && (
                  <span className="text-xs text-muted-foreground">Sem permissões.</span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Novo usuário */}
      <Dialog open={modo === 'novo'} onOpenChange={(aberto) => !aberto && setModo(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>
              O acesso vale assim que você salvar — a pessoa entra com o e-mail e a
              senha definidos aqui.
            </DialogDescription>
          </DialogHeader>
          <UsuarioForm
            action={criarUsuario}
            onSuccess={() => aoSucesso('Usuário criado.')}
            submitLabel="Criar usuário"
          />
        </DialogContent>
      </Dialog>

      {/* Editar usuário */}
      <Dialog open={modo === 'editar'} onOpenChange={(aberto) => !aberto && setModo(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            {selecionado && <DialogDescription>{selecionado.email}</DialogDescription>}
          </DialogHeader>
          {selecionado && (
            <>
              {/* Antes do UsuarioForm de propósito: o form de edição termina com o
                  DialogFooter (Cancelar/Salvar), e "Redefinir senha" depois dele
                  pareceria um botão perdido, fora do diálogo. São dois formulários
                  irmãos, não aninhados — por isso ficam fora um do outro no JSX. */}
              <RedefinirSenha userId={selecionado.userId} />
              <UsuarioForm
                action={atualizarUsuario.bind(null, selecionado.userId)}
                usuario={selecionado}
                souEu={selecionado.userId === meuId}
                onSuccess={() => aoSucesso('Alterações salvas.')}
                submitLabel="Salvar"
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
