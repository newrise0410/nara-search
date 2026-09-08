import { meAction, meWrite } from '@/server/me'
import { changeMemberRole, parseRoleBody, removeMember } from '@/server/invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, context: { params: Promise<{ userId: string }> }): Promise<Response> {
  const { userId } = await context.params
  return meWrite(request, (db, ctx, body) => changeMemberRole(db, ctx, userId, parseRoleBody(body)))
}

export async function DELETE(_request: Request, context: { params: Promise<{ userId: string }> }): Promise<Response> {
  const { userId } = await context.params
  return meAction((db, ctx) => removeMember(db, ctx, userId))
}
