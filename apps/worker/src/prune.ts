import { addDays, today as currentDate } from '@nara/api'
import { sql } from 'drizzle-orm'
import { monthRange } from '@nara/db'
import { resultRows } from '@nara/db'
import type { NaraDb } from '@nara/db'
import { buildBidderSummaries, missingSummaryCount } from './summary'
import { cutoffDate, RETENTION } from './retention'

export interface PruneOptions {
  db: NaraDb
  /** 기준일 YYYY-MM-DD. 미지정이면 @nara/api today() (워크플로 TZ=Asia/Seoul) */
  today?: string
  /** true면 아무것도 쓰지 않고 삭제 예정 건수만 센다 */
  dryRun?: boolean
  /** 안전 검사 주입점(테스트 전용). 기본값은 summary.ts의 missingSummaryCount */
  countMissing?: (db: NaraDb, range: { from: string; to: string }) => Promise<number>
}

export interface PruneTableResult { cutoff: string; deleted: number }

export interface PruneResult {
  today: string
  dryRun: boolean
  retention: { bidders: number; notices: number; contracts: number }
  /** 삭제 전에 보강한 요약 수 + 여전히 요약 없는 낙찰 수 */
  summaries: { updated: number; empty: number; missing: number }
  bidders: PruneTableResult & { droppedPartitions: string[] }
  notices: PruneTableResult
  contracts: PruneTableResult
  databaseBytes: { before: number; after: number }
  elapsedMs: number
}

/** 요약 없는 낙찰의 투찰행을 지울 뻔했을 때 던진다. */
export class PruneSafetyError extends Error {}

type CountRow = { n: number | string | bigint }

async function databaseBytes(db: NaraDb): Promise<number> {
  const rows = resultRows<{ bytes: number | string | bigint }>(await db.execute(sql`SELECT pg_database_size(current_database())::bigint AS bytes`))
  return Number(rows[0]?.bytes ?? 0)
}

function dateText(value: unknown): string | undefined {
  if (value == null) return undefined
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

async function countRows(db: NaraDb, query: ReturnType<typeof sql>): Promise<number> {
  const rows = resultRows<CountRow>(await db.execute(query))
  return Number(rows[0]?.n ?? 0)
}

/** 보존 창 밖 데이터를 지운다. awards 행은 절대 지우지 않는다 */
export async function prune(opts: PruneOptions): Promise<PruneResult> {
  const started = Date.now()
  const today = opts.today ?? currentDate()
  const dryRun = opts.dryRun ?? false
  const biddersCutoff = cutoffDate(today, RETENTION.bidders)
  const noticesCutoff = cutoffDate(today, RETENTION.notices)
  const contractsCutoff = cutoffDate(today, RETENTION.contracts)
  const before = await databaseBytes(opts.db)

  const oldestRows = resultRows<{ oldest: string | Date | null }>(await opts.db.execute(sql`SELECT min("opening_date") AS oldest FROM "bidders"`))
  const oldest = dateText(oldestRows[0]?.oldest)
  let summaries = { updated: 0, empty: 0, missing: 0 }
  let biddersDeleted = 0
  let droppedPartitions: string[] = []

  if (oldest && oldest < biddersCutoff) {
    const summaryRange = { from: oldest, to: addDays(biddersCutoff, -1) }
    if (!dryRun) {
      const built = await buildBidderSummaries(opts.db, { ...summaryRange, onlyMissing: true })
      summaries = { updated: built.updated, empty: built.empty, missing: 0 }
    }
    summaries.missing = await (opts.countMissing ?? missingSummaryCount)(opts.db, summaryRange)
    if (!dryRun && summaries.missing > 0) throw new PruneSafetyError(`요약 없는 낙찰의 투찰행 ${summaries.missing}건을 삭제할 수 없습니다.`)

    const partitionRows = resultRows<{ name: string }>(await opts.db.execute(sql`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_inherits i ON i.inhrelid = c.oid
      JOIN pg_class p ON p.oid = i.inhparent
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE p.relname = 'bidders'
      ORDER BY 1
    `))
    const targets: string[] = []
    for (const row of partitionRows) {
      const match = /^bidders_(\d{4})_(\d{2})$/.exec(row.name)
      if (!match) continue
      const month = Number(match[2])
      if (month < 1 || month > 12) continue
      const range = monthRange(`${match[1]}-${match[2]}-01`)
      if (range.to <= biddersCutoff) targets.push(row.name)
    }
    for (const name of targets) {
      const count = await countRows(opts.db, sql.raw(`SELECT count(*)::int AS n FROM "${name}"`))
      biddersDeleted += count
      if (!dryRun) await opts.db.execute(sql.raw(`DROP TABLE "${name}"`))
    }
    droppedPartitions = [...targets]

    const rangeCount = dryRun
      ? await countRows(opts.db, sql`SELECT count(*)::int AS n FROM "bidders" WHERE "opening_date" < ${biddersCutoff}`)
      : await countRows(opts.db, sql`WITH d AS (DELETE FROM "bidders" WHERE "opening_date" < ${biddersCutoff} RETURNING 1) SELECT count(*)::int AS n FROM d`)
    biddersDeleted += dryRun ? Math.max(0, rangeCount - biddersDeleted) : rangeCount
  }

  const noticeCount = dryRun
    ? await countRows(opts.db, sql`SELECT count(*)::int AS n FROM "notices" WHERE "notice_date" IS NOT NULL AND "notice_date" < ${noticesCutoff}`)
    : await countRows(opts.db, sql`WITH d AS (DELETE FROM "notices" WHERE "notice_date" IS NOT NULL AND "notice_date" < ${noticesCutoff} RETURNING 1) SELECT count(*)::int AS n FROM d`)
  const contractCount = dryRun
    ? await countRows(opts.db, sql`SELECT count(*)::int AS n FROM "contracts" WHERE "conclude_date" IS NOT NULL AND "conclude_date" < ${contractsCutoff}`)
    : await countRows(opts.db, sql`WITH d AS (DELETE FROM "contracts" WHERE "conclude_date" IS NOT NULL AND "conclude_date" < ${contractsCutoff} RETURNING 1) SELECT count(*)::int AS n FROM d`)

  if (!dryRun) {
    await opts.db.execute(sql.raw('VACUUM "bidders"'))
    await opts.db.execute(sql.raw('VACUUM "notices"'))
    await opts.db.execute(sql.raw('VACUUM "contracts"'))
  }
  const after = await databaseBytes(opts.db)
  return {
    today,
    dryRun,
    retention: { ...RETENTION },
    summaries,
    bidders: { cutoff: biddersCutoff, deleted: biddersDeleted, droppedPartitions },
    notices: { cutoff: noticesCutoff, deleted: noticeCount },
    contracts: { cutoff: contractsCutoff, deleted: contractCount },
    databaseBytes: { before, after },
    elapsedMs: Math.max(0, Date.now() - started),
  }
}
