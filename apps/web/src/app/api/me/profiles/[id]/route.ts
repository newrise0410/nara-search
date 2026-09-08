import { meAction, meWrite } from '@/server/me'
import { parseProfileBody, removeProfile, saveProfile } from '@/server/user-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  return meWrite(request, async (db, userId, body) => {
    const { profile, sortOrder } = parseProfileBody(body, id)
    await saveProfile(db, userId, profile, sortOrder)
  })
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  return meAction((db, userId) => removeProfile(db, userId, id))
}
