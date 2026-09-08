import { meAction, meWrite } from '@/server/me'
import { parseChannelBody, removeChannel, updateChannel } from '@/server/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  return meWrite(request, (db, userId, body) => updateChannel(db, userId, id, parseChannelBody(body, { forCreate: false })))
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  return meAction((db, userId) => removeChannel(db, userId, id))
}
