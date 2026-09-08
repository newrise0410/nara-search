import { meRead, meWrite } from '@/server/me'
import { loadOrg, parseOrgNameBody, renameOrg } from '@/server/invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return meRead(loadOrg)
}

export async function POST(request: Request): Promise<Response> {
  return meWrite(request, (db, ctx, body) => renameOrg(db, ctx, parseOrgNameBody(body)))
}
