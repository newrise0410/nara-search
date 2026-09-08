import { meWrite } from '@/server/me'
import { parseCompetitorsBody, saveCompetitors } from '@/server/user-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request): Promise<Response> {
  return meWrite(request, (db, userId, body) => saveCompetitors(db, userId, parseCompetitorsBody(body)))
}
