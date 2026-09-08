import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import InviteAcceptView from '@/components/InviteAcceptView'
import { getOptionalUser } from '@/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '워크스페이스 초대' }

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const user = await getOptionalUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)
  return <main id="main" className="invite-page"><InviteAcceptView token={token} /></main>
}
