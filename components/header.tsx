import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LogoutButton } from './logout-button'

export async function Header() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  return (
    <header className="border-b border-steel-200 bg-white dark:border-steel-700 dark:bg-steel-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/pecas" className="flex items-center gap-2 font-bold text-steel-800 dark:text-steel-100">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">⚙</span>
          Catálogo de Peças
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-steel-500 sm:inline">{data.user?.email}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
