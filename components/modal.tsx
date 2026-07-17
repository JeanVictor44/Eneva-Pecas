'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function Modal({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.back()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) router.back()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-steel-900">
        <div className="mb-2 flex justify-end">
          <button onClick={() => router.back()}
            className="grid h-8 w-8 place-items-center rounded-full text-steel-500 hover:bg-steel-100 dark:hover:bg-steel-800">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
