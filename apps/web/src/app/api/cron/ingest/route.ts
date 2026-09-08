import { addDays, today } from '@nara/api'
import { JOB_KINDS, planJobs, runOnce } from 'worker'
import type { JobKind, PlanResult, RunOnceResult } from 'worker'
import { MissingDatabaseUrlError, getDb } from '@/server/db'
import { ensureNaraConfigured } from '@/server/nara'

/** Vercel Hobby 한도. Pro(Fluid Compute)로 올릴 때 800 으로 바꾼다. Next가 정적 분석하므로 리터럴이어야 한다 */
export const maxDuration = 300
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status })
}

async function ingest(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return errorResponse('CRON_SECRET이 설정되지 않았습니다.', 503)
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return errorResponse('unauthorized', 401)
  if (!ensureNaraConfigured()) return errorResponse('NARA_API_KEY가 설정되지 않았습니다.', 503)

  let db
  try {
    db = getDb()
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) return errorResponse(error.message, 503)
    throw error
  }
  try {
    const planDays = Math.min(31, Math.max(1, Number(process.env.CRON_PLAN_DAYS) || 2))
    const to = today()
    const from = addDays(to, -(planDays - 1))
    const planned: Record<JobKind, PlanResult> = {} as Record<JobKind, PlanResult>
    for (const kind of JOB_KINDS) planned[kind] = await planJobs(db, { kind, from, to })
    const configuredBudget = Number(process.env.CRON_BUDGET_MS)
    const budgetMs = configuredBudget > 0 ? configuredBudget : maxDuration * 1000 - 30_000
    const result: RunOnceResult = await runOnce({ db, budgetMs })
    return Response.json({ ok: true, planned, result }, { status: 200 })
  } catch (error) {
    console.error(error)
    return errorResponse(messageOf(error), 500)
  }
}

export async function GET(request: Request): Promise<Response> {
  return ingest(request)
}

export async function POST(request: Request): Promise<Response> {
  return ingest(request)
}
