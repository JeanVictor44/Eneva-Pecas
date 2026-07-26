'use client'

import { useActionState, useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { redefinirSenha, type EstadoUsuario } from '@/app/usuarios/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function RedefinirSenha({ userId }: { userId: string }) {
  const [aberto, setAberto] = useState(false)

  if (!aberto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <KeyRound />
        Redefinir senha
      </Button>
    )
  }

  return <FormNovaSenha userId={userId} onFechar={() => setAberto(false)} />
}

function FormNovaSenha({
  userId,
  onFechar,
}: {
  userId: string
  onFechar: () => void
}) {
  const [state, formAction, pending] = useActionState<EstadoUsuario, FormData>(
    redefinirSenha.bind(null, userId),
    { erro: null, ok: false },
  )

  useEffect(() => {
    if (state.ok) {
      toast.success('Senha redefinida.')
      onFechar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok])

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-border p-3">
      {state.erro && (
        <p role="alert" className="text-sm text-destructive">
          {state.erro}
        </p>
      )}
      <Label htmlFor="nova-senha">Nova senha</Label>
      <div className="flex gap-2">
        <Input
          id="nova-senha"
          name="senha"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button type="button" variant="ghost" onClick={onFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
