import { redirect } from 'next/navigation'
import { Header } from '@/components/header'
import { Toaster } from '@/components/ui/sonner'
import { perfilAtual } from '@/lib/perfil'

export default async function PecasLayout({ children }: { children: React.ReactNode }) {
  const perfil = await perfilAtual()
  // Inativo ou sem 'visualizar' não entra. O middleware só garante que existe
  // sessão; a autorização é aqui, no servidor.
  if (!perfil?.permissoes.visualizar) redirect('/sem-acesso')

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <Toaster theme="light" position="bottom-right" />
    </div>
  )
}
