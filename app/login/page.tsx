import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) redirect('/pecas')

  return (
    <main className="flex min-h-dvh items-center justify-center bg-linear-to-b from-brand-50 to-background p-4">
      <LoginForm />
    </main>
  )
}
