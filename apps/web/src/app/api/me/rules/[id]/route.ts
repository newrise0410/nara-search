import { meAction, meWrite } from '@/server/me'
import { parseRuleBody, removeRule, updateRule } from '@/server/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  return meWrite(request, (db, userId, body) => updateRule(db, userId, id, parseRuleBody(body, id)))
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  return meAction((db, userId) => removeRule(db, userId, id))
}
