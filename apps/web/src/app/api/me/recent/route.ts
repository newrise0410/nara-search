import { meWrite } from '@/server/me'
import { parseRecentBody, saveRecent } from '@/server/user-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request): Promise<Response> {
  return meWrite(request, (db, userId, body) => saveRecent(db, userId, parseRecentBody(body)))
}
