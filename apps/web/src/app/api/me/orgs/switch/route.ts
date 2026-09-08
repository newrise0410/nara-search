import { meWrite } from '@/server/me'
import { parseSwitchBody, switchOrg } from '@/server/invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return meWrite(request, (db, ctx, body) => switchOrg(db, ctx, parseSwitchBody(body)))
}
