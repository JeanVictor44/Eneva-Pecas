'use client'

import { useActionState } from 'react'
import { Wrench } from 'lucide-react'
import { entrar, type EstadoAuth } from './actions'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const inicial: EstadoAuth = { erro: null }

export function LoginForm() {
  const [state, action, pending] = useActionState(entrar, inicial)

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center gap-3 pb-2 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Wrench className="size-6" />
        </span>
        <div className="space-y-1">
          <CardTitle className="text-xl">Catálogo de Peças</CardTitle>
          <CardDescription>
            Entre com sua conta para acessar o catálogo de manutenção
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <form action={action} className="space-y-5">
          {state?.erro && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.erro}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="voce@empresa.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
