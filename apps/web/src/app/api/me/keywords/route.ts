import { meWrite } from '@/server/me'
import { parseKeywordsBody, saveKeywords } from '@/server/user-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request): Promise<Response> {
  return meWrite(request, (db, userId, body) => saveKeywords(db, userId, parseKeywordsBody(body)))
}
