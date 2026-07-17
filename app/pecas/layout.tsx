import { Header } from '@/components/header'
import { Toaster } from '@/components/ui/sonner'

export default function PecasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <Toaster theme="light" position="bottom-right" />
    </div>
  )
}
