import { meAction } from '@/server/me'
import { cancelInvite } from '@/server/invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  return meAction((db, ctx) => cancelInvite(db, ctx, id))
}
