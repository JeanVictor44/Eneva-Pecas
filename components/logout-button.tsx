'use client'

import { sair } from '@/app/login/actions'

export function LogoutButton() {
  return (
    <form action={sair}>
      <button
        type="submit"
        className="rounded-lg border border-steel-300 px-3 py-1.5 text-sm text-steel-700 transition hover:bg-steel-100 dark:border-steel-600 dark:text-steel-200 dark:hover:bg-steel-800"
      >
        Sair
      </button>
    </form>
  )
}
