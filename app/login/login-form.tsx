'use client'

import { useActionState } from 'react'
import { entrar, type EstadoAuth } from './actions'

const inicial: EstadoAuth = { erro: null }

export function LoginForm() {
  const [state, action, pending] = useActionState(entrar, inicial)

  return (
    <form
      action={action}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-steel-200 bg-white p-8 shadow-sm dark:border-steel-700 dark:bg-steel-800"
    >
      <div>
        <h1 className="text-xl font-bold text-steel-800 dark:text-steel-100">
          Catálogo de Peças
        </h1>
        <p className="text-sm text-steel-500">Entre para continuar</p>
      </div>

      {state?.erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.erro}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">E-mail</label>
        <input
          id="email" name="email" type="email" required autoComplete="email"
          className="w-full rounded-lg border border-steel-300 px-3 py-2 outline-none focus:border-brand-600 dark:bg-steel-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">Senha</label>
        <input
          id="password" name="password" type="password" required autoComplete="current-password"
          className="w-full rounded-lg border border-steel-300 px-3 py-2 outline-none focus:border-brand-600 dark:bg-steel-900"
        />
      </div>

      <button
        type="submit" disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
