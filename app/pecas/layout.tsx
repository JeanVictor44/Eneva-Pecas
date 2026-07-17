import { Header } from '@/components/header'

export default function PecasLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      {modal}
    </div>
  )
}
