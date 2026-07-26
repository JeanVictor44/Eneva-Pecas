'use client'

import { useActionState, useEffect } from 'react'
import type { EstadoUsuario } from '@/app/usuarios/actions'
import type { UsuarioLista } from '@/lib/usuarios'
import { PERMISSOES, ROTULOS } from '@/lib/permissoes'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'

type AcaoForm = (state: EstadoUsuario, formData: FormData) => Promise<EstadoUsuario>

const ESTADO_INICIAL: EstadoUsuario = { erro: null, ok: false }

export function UsuarioForm({
  action,
  usuario,
  souEu = false,
  onSuccess,
  submitLabel = 'Salvar',
}: {
  action: AcaoForm
  usuario?: UsuarioLista
  souEu?: boolean
  onSuccess: () => void
  submitLabel?: string
}) {
  const [state, formAction, pending] = useActionState<EstadoUsuario, FormData>(
    action,
    ESTADO_INICIAL,
  )

  useEffect(() => {
    if (state.ok) onSuccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok])

  return (
    <form action={formAction} className="space-y-5">
      {state.erro && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.erro}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" required defaultValue={usuario?.nome ?? ''} />
      </div>

      {usuario ? (
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {usuario.email}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha">Senha inicial</Label>
            <Input
              id="senha"
              name="senha"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
          </div>
        </>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">Permissões</legend>
        {PERMISSOES.map((p) => {
          const travado = souEu && (p === 'gerir_usuarios' || p === 'visualizar')
          return (
            <div key={p} className="flex items-center gap-2.5">
              <Checkbox
                id={`perm_${p}`}
                name={`perm_${p}`}
                defaultChecked={usuario ? usuario.permissoes[p] : p === 'visualizar'}
                disabled={travado}
              />
              {/* Campo desabilitado não é enviado pelo navegador. Sem este hidden, o
                  servidor leria a permissão como "false" e a trava anti-lockout
                  rejeitaria toda edição do próprio perfil. */}
              {travado && <input type="hidden" name={`perm_${p}`} value="on" />}
              <Label htmlFor={`perm_${p}`} className="font-normal">
                {ROTULOS[p]}
              </Label>
            </div>
          )
        })}
        <p className="text-xs text-muted-foreground">
          &ldquo;Visualizar peças&rdquo; é necessária para todas as outras — sem ela a
          pessoa não entra no catálogo.
        </p>
        {souEu && (
          <p className="text-xs text-muted-foreground">
            Você não pode remover o seu próprio acesso de visualização nem a sua
            permissão de gerir usuários.
          </p>
        )}
      </fieldset>

      {usuario && (
        <div className="flex items-center gap-2.5 border-t border-border pt-4">
          <Checkbox
            id="ativo"
            name="ativo"
            defaultChecked={usuario.ativo}
            disabled={souEu}
          />
          {/* Mesmo motivo do hidden acima: desabilitado não é enviado. */}
          {souEu && <input type="hidden" name="ativo" value="on" />}
          <Label htmlFor="ativo" className="font-normal">
            Acesso ativo
          </Label>
        </div>
      )}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
          Cancelar
        </DialogClose>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Salvando…' : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
