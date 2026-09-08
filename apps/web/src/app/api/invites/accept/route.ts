import { meCreate } from '@/server/me'
import { acceptInvite, parseAcceptBody } from '@/server/invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return meCreate(request, (db, ctx, body) => acceptInvite(db, ctx, parseAcceptBody(body)))
}
