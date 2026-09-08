import { meCreate, meRead } from '@/server/me'
import { createRule, loadRules, parseRuleBody } from '@/server/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return meRead(loadRules)
}

export async function POST(request: Request): Promise<Response> {
  return meCreate(request, (db, userId, body) => createRule(db, userId, parseRuleBody(body, '')))
}
