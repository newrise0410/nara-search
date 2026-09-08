import { sql, eq } from 'drizzle-orm'
import { NaraApiError } from '@nara/api'
import type { PrespecBizDiv } from '@nara/api'
import { ingestJobs, resultRows } from '@nara/db'
import type { NaraDb } from '@nara/db'
import type { JobKind } from './plan'
import { ingestNoticeChunk } from './ingest/notice'
import { ingestAwardChunk } from './ingest/award'
import { ingestContractChunk } from './ingest/contract'
import { ingestPrespecChunk } from './ingest/prespec'
import { recomputeBidderCounts } from './upsert'
import { buildBidderSummaries } from './summary'

export const DEFAULT_BUDGET_MS = 600_000
export const MAX_ATTEMPTS = 5
/** 이 시간 넘게 갱신이 없는 running 잡은 죽은 프로세스가 남긴 것으로 보고 다시 선점한다 */
export const STALE_RUNNING_MINUTES = 30

/** 숫자 리터럴 상수만 넣으므로 주입 위험이 없다 */
const STALE_RUNNING_SQL = sql.raw(`("status" = 'running' AND "updated_at" < now() - interval '${STALE_RUNNING_MINUTES} minutes')`)
/** 다시 시도할 조달청 오류코드 (제공기관 장애·트래픽 초과) */
export const RETRYABLE_CODES: readonly string[] = ['01', '02', '04', '05', '22']

export interface RunOnceOptions {
  db: NaraDb
  budgetMs?: number
  maxJobs?: number
  now?: () => number
  signal?: AbortSignal
  /** 지정하면 이 조건에 맞는 잡만 처리 (backfill 에서 사용) */
  filter?: { kind?: JobKind; from?: string; to?: string }
  /** award 잡을 --summary-only 모드로 처리한다 */
  summaryOnly?: boolean
}

export interface RunOnceResult {
  claimed: number
  completed: number
  deferred: number
  failed: number
  rows: number
  requests: number
  elapsedMs: number
}

interface ClaimedJob {
  id: number
  kind: JobKind
  bizDiv: string
  chunkStart: string
  chunkEnd: string
  nextPage: number
  status: string
  rows: number
  totalCount?: number
  attempts: number
}

type Row = Record<string, unknown>

function textValue(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '')
}

function jobFromRow(row: Row): ClaimedJob {
  return {
    id: Number(row.id), kind: row.kind as JobKind, bizDiv: textValue(row.biz_div), chunkStart: textValue(row.chunk_start), chunkEnd: textValue(row.chunk_end), nextPage: Number(row.next_page), status: textValue(row.status), rows: Number(row.rows ?? 0),
    totalCount: row.total_count == null ? undefined : Number(row.total_count), attempts: Number(row.attempts ?? 0),
  }
}

async function claimJob(db: NaraDb, filter?: RunOnceOptions['filter'], excludedIds: ReadonlySet<number> = new Set()): Promise<ClaimedJob | undefined> {
  const conditions = [sql`("status" = 'pending'
    OR ("status" = 'failed' AND "attempts" < ${MAX_ATTEMPTS})
    OR ${STALE_RUNNING_SQL})`]
  if (filter?.kind) conditions.push(sql`"kind" = ${filter.kind}`)
  if (filter?.from) conditions.push(sql`"chunk_start" >= ${filter.from}`)
  if (filter?.to) conditions.push(sql`"chunk_start" <= ${filter.to}`)
  if (excludedIds.size) conditions.push(sql`"id" NOT IN (${sql.join([...excludedIds].map((id) => sql`${id}`), sql`, `)})`)
  const result = await db.execute(sql`
    UPDATE "ingest_jobs"
    SET "status" = 'running', "updated_at" = now()
    WHERE "id" = (
      SELECT "id" FROM "ingest_jobs"
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY "chunk_start" DESC, "kind", "biz_div"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `)
  const row = resultRows<Row>(result)[0]
  return row ? jobFromRow(row) : undefined
}

async function setJobStatus(db: NaraDb, job: ClaimedJob, status: 'done' | 'pending' | 'failed', error: string | null, opts: { consumeAttempt?: boolean; defer?: boolean; resetAttempts?: boolean } = {}): Promise<void> {
  await db.update(ingestJobs).set({
    status, error, updatedAt: sql`now()`,
    ...(opts.consumeAttempt ? { attempts: sql`"attempts" + 1` } : {}),
    ...(opts.resetAttempts ? { attempts: 0 } : {}),
    ...(opts.defer ? { deferrals: sql`"deferrals" + 1` } : {}),
  }).where(eq(ingestJobs.id, job.id))
}

/** Drizzle의 "Failed query: …(전체 SQL+params)" 대신 원인(Postgres 메시지)을 앞에 두고 1KB로 자른다. */
function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause as { message?: string; code?: string } | undefined
  const head = cause?.message ? `[${cause.code ?? '?'}] ${cause.message} — ` : ''
  return (head + error.message).slice(0, 1024)
}

type PageWork = (work: (db: NaraDb) => Promise<void>) => Promise<void>

async function ingestJob(db: NaraDb, job: ClaimedJob, started: number, budgetMs: number, now: () => number, signal: AbortSignal | undefined, onRows: (rows: number) => void, onRequests: (requests: number) => void, onCheckpoint: (db: NaraDb, pageNo: number, totalCount: number | undefined, rowsSoFar: number) => Promise<void>, summaryOnly: boolean): Promise<{ nextPage: number | null; truncated: boolean; note: string | null }> {
  let pageDb = db
  let receivedRows = 0
  const notes: string[] = []
  const pageTransaction: PageWork = async (work) => db.transaction(async (tx) => {
    const txDb = tx as unknown as NaraDb; const previous = pageDb; pageDb = txDb
    try { await work(txDb) } finally { pageDb = previous }
  })
  const checkpoint = async (meta: { pageNo: number; totalCount?: number }, rowsInPage: number) => {
    const nextRows = receivedRows + rowsInPage
    await onCheckpoint(pageDb, meta.pageNo, meta.totalCount, nextRows)
    receivedRows = nextRows; onRows(rowsInPage)
  }
  const shouldContinue = () => !signal?.aborted && now() - started < budgetMs
  const chunk = { db, chunkStart: job.chunkStart, chunkEnd: job.chunkEnd, bizDiv: job.bizDiv, startPage: job.nextPage, signal, shouldContinue, onCheckpoint: checkpoint, pageTransaction, onNote: (note: string) => notes.push(note), summaryOnly }
  const result = job.kind === 'notice' ? await ingestNoticeChunk(chunk)
    : job.kind === 'award' ? await ingestAwardChunk(chunk)
    : job.kind === 'contract' ? await ingestContractChunk(chunk)
    : await ingestPrespecChunk(chunk)
  onRequests(result.requests)
  return { nextPage: result.nextPage, truncated: result.truncated, note: notes.join(' | ') || null }
}

/** pending/failed 잡과 30분 이상 정체된 running 잡을 최신 청크부터 예산과 페이지 상한 안에서 처리한다. */
export async function runOnce(opts: RunOnceOptions): Promise<RunOnceResult> {
  const now = opts.now ?? Date.now
  const started = now()
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS
  const maxJobs = opts.maxJobs ?? Infinity
  const result: RunOnceResult = { claimed: 0, completed: 0, deferred: 0, failed: 0, rows: 0, requests: 0, elapsedMs: 0 }
  const claimedIds = new Set<number>()
  while (result.claimed < maxJobs && now() - started < budgetMs && !opts.signal?.aborted) {
    const job = await claimJob(opts.db, opts.filter, claimedIds)
    if (!job) break
    claimedIds.add(job.id)
    result.claimed++
    try {
      const fetched = await ingestJob(opts.db, job, started, budgetMs, now, opts.signal, (rows) => { result.rows += rows }, (requests) => { result.requests += requests }, async (pageDb, pageNo, totalCount, rowsSoFar) => {
        const firstTotalCount = job.totalCount == null && totalCount != null ? totalCount : undefined
        const set = { nextPage: pageNo + 1, rows: (opts.summaryOnly ? 0 : job.rows) + rowsSoFar, status: 'running' as const, error: null, updatedAt: sql`now()`, ...(firstTotalCount !== undefined ? { totalCount: firstTotalCount } : {}) }
        await pageDb.update(ingestJobs).set(set).where(eq(ingestJobs.id, job.id))
        if (firstTotalCount !== undefined) job.totalCount = firstTotalCount
      }, opts.summaryOnly ?? false)
      if (fetched.nextPage === null) {
        await setJobStatus(opts.db, job, 'done', fetched.note, { resetAttempts: true }); result.completed++
        if (job.kind === 'award' && !opts.summaryOnly) {
          const bizDivKey = job.bizDiv ? (job.bizDiv as PrespecBizDiv) : undefined
          await recomputeBidderCounts(opts.db, job.chunkStart, bizDivKey)
          await buildBidderSummaries(opts.db, { from: job.chunkStart, to: job.chunkStart, bizDivKey })
        }
      } else {
        await setJobStatus(opts.db, job, 'pending', fetched.note, { defer: true }); result.deferred++
      }
    } catch (error) {
      const retryable = error instanceof NaraApiError && RETRYABLE_CODES.includes(error.code)
      const exhausted = job.attempts + 1 >= MAX_ATTEMPTS
      const retry = retryable && !exhausted
      await setJobStatus(opts.db, job, retry ? 'pending' : 'failed', messageOf(error), { consumeAttempt: true })
      if (!retry) result.failed++
    }
  }
  result.elapsedMs = Math.max(0, now() - started)
  return result
}
