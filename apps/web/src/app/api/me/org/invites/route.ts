import { meCreate } from '@/server/me'
import { createInvite, parseInviteBody } from '@/server/invites'
import { originOf } from '@/lib/auth-routes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const origin = originOf(request)
  return meCreate(request, (db, ctx, body) => createInvite(db, ctx, parseInviteBody(body), origin))
}
