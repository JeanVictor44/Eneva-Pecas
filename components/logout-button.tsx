'use client'

import { LogOut } from 'lucide-react'
import { sair } from '@/app/login/actions'
import { Button } from '@/components/ui/button'

export function LogoutButton() {
  return (
    <form action={sair}>
      <Button type="submit" variant="outline" size="sm">
        <LogOut />
        Sair
      </Button>
    </form>
  )
}
