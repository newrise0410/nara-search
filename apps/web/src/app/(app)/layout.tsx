import type { ReactNode } from 'react'
import AppShell from '@/components/AppShell'
import UserDataSync from '@/components/UserDataSync'
import { getOptionalUser } from '@/server/auth'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getOptionalUser()
  return (
    <AppShell userEmail={user?.email ?? null}>
      <UserDataSync signedIn={Boolean(user)} />
      {children}
    </AppShell>
  )
}
