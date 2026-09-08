import { alertRuns, awardStats, ingestJobs, resultRows } from '@nara/db'
import type { NaraDb } from '@nara/db'
import { count, desc, max, min, sql } from 'drizzle-orm'
import { RETENTION, STORAGE_BUDGET_BYTES, STORAGE_WARN_RATIO } from 'worker'
import type { JobKindName, StatusResponse, StatusStats, StatusStorage } from '@/lib/api-types'

const KIND_ORDER: readonly JobKindName[] = ['notice', 'award', 'contract', 'prespec']

/** 마지막 done 이후 이 시간을 넘기면 정체로 본다(일일 수집 주기 24시간 + 2시간 여유) */
export const STALE_HOURS = 26

function isoValue(value: unknown): string | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function dateValue(value: unknown): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/** 응답에 담을 테이블 수 */
export const STORAGE_TABLE_LIMIT = 12

/** pg_database_size와 테이블별 총 크기. 파티션 자식은 부모 이름에 합산한다 */
export async function loadStorage(db: NaraDb): Promise<StatusStorage> {
  const [databaseRows, tableResult] = await Promise.all([
    db.execute(sql`SELECT pg_database_size(current_database())::bigint AS bytes`),
    db.execute(sql`
      SELECT coalesce(p.relname, c.relname) AS name, sum(pg_total_relation_size(c.oid))::bigint AS bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      LEFT JOIN pg_inherits i ON i.inhrelid = c.oid
      LEFT JOIN pg_class p ON p.oid = i.inhparent
      WHERE c.relkind IN ('r', 'p')
      GROUP BY 1
      ORDER BY 2 DESC, 1
      LIMIT ${STORAGE_TABLE_LIMIT}
    `),
  ])
  const database = resultRows<{ bytes: number | string | bigint }>(databaseRows)[0]
  const tables = resultRows<{ name: string; bytes: number | string | bigint }>(tableResult).map((row) => ({ name: row.name, bytes: Number(row.bytes ?? 0) }))
  const databaseBytes = Number(database?.bytes ?? 0)
  const budgetBytes = Number(process.env.STORAGE_BUDGET_BYTES) || STORAGE_BUDGET_BYTES
  const usedRatio = Math.round((databaseBytes / budgetBytes) * 1000) / 1000
  return {
    databaseBytes,
    budgetBytes,
    usedRatio,
    overBudget: usedRatio >= STORAGE_WARN_RATIO,
    tables,
    retention: { ...RETENTION },
  }
}

/** award_stats 최신성(015). 행이 없으면 window/computedAt은 null, stale은 true */
export async function loadAwardStatsFreshness(db: NaraDb, now = new Date()): Promise<StatusStats> {
  const rows = await db.select({
    cells: count(),
    computedAt: max(awardStats.computedAt),
    windowFrom: min(awardStats.windowFrom),
    windowTo: max(awardStats.windowTo),
  }).from(awardStats)
  const row = rows[0]
  const computedAt = isoValue(row?.computedAt)
  const windowFrom = dateValue(row?.windowFrom)
  const windowTo = dateValue(row?.windowTo)
  const computedDate = computedAt == null ? null : new Date(computedAt)
  const stale = computedDate == null || Number.isNaN(computedDate.getTime()) || now.getTime() - computedDate.getTime() > STALE_HOURS * 3_600_000
  return {
    window: windowFrom != null && windowTo != null ? { from: windowFrom, to: windowTo } : null,
    cells: Number(row?.cells ?? 0),
    computedAt,
    stale,
  }
}

export async function loadStatus(db: NaraDb): Promise<StatusResponse> {
  /** done 청크의 최소 시작일~최대 종료일. 중간 결손(미수집 청크)은 반영하지 않는 근사값이다 */
  const rows = await db.select({
    kind: ingestJobs.kind,
    lastDoneAt: sql<string | null>`max(${ingestJobs.updatedAt}) filter (where ${ingestJobs.status} = 'done')`,
    latestChunkStart: sql<string | null>`max(${ingestJobs.chunkStart}) filter (where ${ingestJobs.status} = 'done')`,
    coverageFrom: sql<string | null>`min(${ingestJobs.chunkStart}) filter (where ${ingestJobs.status} = 'done')`,
    coverageTo: sql<string | null>`max(${ingestJobs.chunkEnd}) filter (where ${ingestJobs.status} = 'done')`,
    coverageRows: sql<number>`coalesce(sum(${ingestJobs.rows}) filter (where ${ingestJobs.status} = 'done'), 0)::int`,
    pending: sql<number>`count(*) filter (where ${ingestJobs.status} in ('pending', 'running'))::int`,
    failed: sql<number>`count(*) filter (where ${ingestJobs.status} = 'failed')::int`,
    done: sql<number>`count(*) filter (where ${ingestJobs.status} = 'done')::int`,
  }).from(ingestJobs).groupBy(ingestJobs.kind)
  const byKind = new Map(rows.map((row) => [row.kind, row]))
  const kinds = KIND_ORDER.map((kind) => {
    const row = byKind.get(kind)
    return {
      kind,
      lastDoneAt: isoValue(row?.lastDoneAt),
      latestChunkStart: dateValue(row?.latestChunkStart),
      pending: Number(row?.pending ?? 0),
      failed: Number(row?.failed ?? 0),
      done: Number(row?.done ?? 0),
      coverage: { from: dateValue(row?.coverageFrom), to: dateValue(row?.coverageTo), rows: Number(row?.coverageRows ?? 0) },
    }
  })
  const now = new Date()
  const generatedAt = now.toISOString()
  const [alertRows, jobRows] = await Promise.all([
    db.select({
      startedAt: alertRuns.startedAt,
      finishedAt: alertRuns.finishedAt,
      matched: alertRuns.matched,
      sent: alertRuns.sent,
      failed: alertRuns.failed,
      error: alertRuns.error,
    }).from(alertRuns).orderBy(desc(alertRuns.id)).limit(1),
    db.select({
      running: sql<number>`count(*) filter (where ${ingestJobs.status} = 'running')::int`,
      pending: sql<number>`count(*) filter (where ${ingestJobs.status} = 'pending')::int`,
      failed: sql<number>`count(*) filter (where ${ingestJobs.status} = 'failed')::int`,
    }).from(ingestJobs),
  ])
  const alert = alertRows[0]
  const jobs = jobRows[0]
  const stale = kinds.flatMap((kind) => {
    if (kind.lastDoneAt == null) return []
    const hours = (now.getTime() - new Date(kind.lastDoneAt).getTime()) / 3_600_000
    return hours > STALE_HOURS ? [{ kind: kind.kind, hoursSinceLastDone: Math.round(hours * 10) / 10 }] : []
  })
  const storage = await loadStorage(db)
  const stats = await loadAwardStatsFreshness(db, now)
  return {
    generatedAt,
    kinds,
    alerts: alert == null ? null : {
      lastStartedAt: isoValue(alert.startedAt),
      lastFinishedAt: isoValue(alert.finishedAt),
      matched: Number(alert.matched),
      sent: Number(alert.sent),
      failed: Number(alert.failed),
      error: alert.error ?? null,
    },
    stale,
    jobs: {
      running: Number(jobs?.running ?? 0),
      pending: Number(jobs?.pending ?? 0),
      failed: Number(jobs?.failed ?? 0),
    },
    storage,
    stats,
  }
}
