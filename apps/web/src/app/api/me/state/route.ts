import { loadUserState } from '@/server/user-data'
import { meRead } from '@/server/me'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return meRead(loadUserState)
}
