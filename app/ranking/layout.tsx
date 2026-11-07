import { redirect } from 'next/navigation'
import { Header } from '@/components/header'
import { perfilAtual } from '@/lib/perfil'

export default async function RankingLayout({ children }: { children: React.ReactNode }) {
  const perfil = await perfilAtual()
  if (!perfil?.permissoes.visualizar) redirect('/sem-acesso')

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
