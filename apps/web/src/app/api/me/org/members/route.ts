import { meRead } from '@/server/me'
import { loadMembers } from '@/server/invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return meRead(loadMembers)
}
