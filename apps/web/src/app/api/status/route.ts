import { MissingDatabaseUrlError, getDb } from '@/server/db'
import { loadStatus } from '@/server/status'
import { guardApi } from '@/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function GET(): Promise<Response> {
  const denied = await guardApi()
  if (denied) return denied
  try {
    return Response.json(await loadStatus(getDb()), { status: 200 })
  } catch (error) {
    const status = error instanceof MissingDatabaseUrlError ? 503 : 500
    if (status === 500) console.error(error)
    return Response.json({ error: messageOf(error) }, { status })
  }
}
