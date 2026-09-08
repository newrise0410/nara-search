import { ParamError } from '@/server/search'
import { parseDashboardParams, loadDashboard } from '@/server/dashboard'
import { MissingDatabaseUrlError, getDb } from '@/server/db'
import { guardApi } from '@/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function GET(request: Request): Promise<Response> {
  const denied = await guardApi()
  if (denied) return denied
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const params = parseDashboardParams(new URL(request.url).searchParams)
    const body = await loadDashboard(getDb(), params)
    return Response.json(body, { status: 200, headers })
  } catch (error) {
    const status = error instanceof ParamError ? 400 : error instanceof MissingDatabaseUrlError ? 503 : 500
    if (status === 500) console.error(error)
    return Response.json({ error: messageOf(error) }, { status, headers })
  }
}
