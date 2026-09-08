import { runAlerts } from 'worker'
import { MissingDatabaseUrlError, getDb } from '@/server/db'

export const maxDuration = 300
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function alerts(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return Response.json({ error: 'CRON_SECRET이 설정되지 않았습니다.' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 })
  let db
  try { db = getDb() } catch (error) {
    if (error instanceof MissingDatabaseUrlError) return Response.json({ error: error.message }, { status: 503 })
    throw error
  }
  try {
    const result = await runAlerts({ db })
    return Response.json({ ok: true, result }, { status: 200 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function GET(request: Request): Promise<Response> { return alerts(request) }
export async function POST(request: Request): Promise<Response> { return alerts(request) }
