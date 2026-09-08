import { MissingDatabaseUrlError, getDb } from '@/server/db'
import { loadStatus } from '@/server/status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function health(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return Response.json({ error: 'CRON_SECRET이 설정되지 않았습니다.' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const status = await loadStatus(getDb())
    const stale = status.stale ?? []
    const storage = status.storage ?? null
    return Response.json({
      ok: stale.length === 0 && !(storage?.overBudget ?? false),
      generatedAt: status.generatedAt,
      stale,
      jobs: status.jobs ?? { running: 0, pending: 0, failed: 0 },
      alerts: status.alerts ?? null,
      storage,
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) return Response.json({ error: error.message }, { status: 503 })
    console.error(error)
    return Response.json({ error: messageOf(error) }, { status: 500 })
  }
}

export async function GET(request: Request): Promise<Response> {
  return health(request)
}

export async function POST(request: Request): Promise<Response> {
  return health(request)
}
