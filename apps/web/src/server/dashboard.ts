import { addDays, today } from '@nara/api'
import { and, asc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import { awards, ingestJobs, notices } from '@nara/db'
import type { NaraDb } from '@nara/db'
import type { DashboardResponse, DashboardSource, JobKindName } from '@/lib/api-types'
import { likePattern, ParamError } from './search'
import { loadStatus } from './status'

export interface DashboardParams {
  /** 관심 키워드. 최대 10개 */
  keywords: string[]
  /** 활성 프로필 기본 검색어. 마감 임박 필터에만 쓴다. 최대 10개 */
  profileKeywords: string[]
  /** 키워드 히트 집계 구간 길이(일). 1..31 */
  days: number
  /** 마감 임박 구간(일). 1..30 */
  deadlineDays: number
  /** 마감 임박 표시 건수. 1..20 */
  limit: number
}

function repeated(sp: URLSearchParams, name: string, maximum: number): string[] {
  const values = [...new Set(sp.getAll(name).map((value) => value.trim()).filter(Boolean))]
  if (values.length > maximum) throw new ParamError(`${name}는 최대 ${maximum}개까지 입력할 수 있습니다.`)
  return values
}

function integerParam(sp: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = sp.get(name)
  if (raw == null) return fallback
  if (!/^\d+$/.test(raw)) throw new ParamError(`${name}은 정수여야 합니다.`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ParamError(`${name}의 범위가 올바르지 않습니다.`)
  return value
}

/** URLSearchParams → DashboardParams. 잘못된 값은 ParamError를 던진다 */
export function parseDashboardParams(sp: URLSearchParams): DashboardParams {
  return {
    keywords: repeated(sp, 'keyword', 10),
    profileKeywords: repeated(sp, 'profileKeyword', 10),
    days: integerParam(sp, 'days', 1, 1, 31),
    deadlineDays: integerParam(sp, 'deadlineDays', 7, 1, 30),
    limit: integerParam(sp, 'limit', 5, 1, 20),
  }
}

function countOf(value: unknown): number {
  return Number(value ?? 0)
}

function sourceState(kind: JobKindName, done: number, failed: number): DashboardSource['state'] {
  if (kind === 'prespec') return done > 0 ? 'ok' : 'realtime'
  return failed > 0 ? 'failed' : done > 0 ? 'ok' : 'waiting'
}

export async function loadDashboard(db: NaraDb, p: DashboardParams): Promise<DashboardResponse> {
  const status = await loadStatus(db)
  const awardStatus = status.kinds.find((kind) => kind.kind === 'award')
  const noticeStatus = status.kinds.find((kind) => kind.kind === 'notice')
  const awardDate = awardStatus?.latestChunkStart ?? null
  const noticeDate = noticeStatus?.latestChunkStart ?? null

  const awardNoticeRows = awardDate
    ? await db.select({ count: sql<number>`count(*)::int` }).from(awards).where(eq(awards.openingDate, awardDate))
    : []
  const awardRowRows = awardDate
    ? await db.select({ rows: sql<string>`coalesce(sum(${ingestJobs.rows}), 0)::bigint` }).from(ingestJobs).where(and(eq(ingestJobs.kind, 'award'), eq(ingestJobs.status, 'done'), eq(ingestJobs.chunkStart, awardDate)))
    : []
  const noticeCountRows = noticeDate
    ? await db.select({ count: sql<number>`count(*)::int` }).from(notices).where(eq(notices.noticeDate, noticeDate))
    : []

  const to = awardDate ?? today()
  const from = addDays(to, -(p.days - 1))
  const keywords = await Promise.all(p.keywords.map(async (keyword) => {
    const like = likePattern(keyword)
    const rows = await db.select({ count: sql<number>`count(*)::int` }).from(awards).where(and(
      gte(awards.openingDate, from),
      lte(awards.openingDate, to),
      or(ilike(awards.title, like), ilike(awards.ntceInsttNm, like), ilike(awards.dmndInsttNm, like), ilike(awards.bidNtceNo, like)),
    ))
    return { keyword, count: countOf(rows[0]?.count) }
  }))

  const deadlineConditions = [gte(notices.bidClose, today()), lte(notices.bidClose, `${addDays(today(), p.deadlineDays)} 23:59`)]
  if (p.profileKeywords.length > 0) {
    const profileConditions = p.profileKeywords.flatMap((keyword) => {
      const like = likePattern(keyword)
      return [ilike(notices.title, like), ilike(notices.ntceInsttNm, like), ilike(notices.dmndInsttNm, like)]
    })
    deadlineConditions.push(or(...profileConditions)!)
  }
  const deadlineRows = await db.select({
    bidNtceNo: notices.bidNtceNo,
    ord: notices.ord,
    title: notices.title,
    agency: notices.ntceInsttNm,
    bidClose: notices.bidClose,
    opening: notices.opening,
    estimatedPrice: notices.estimatedPrice,
    budgetAmt: notices.budgetAmt,
    noticeUrl: notices.noticeUrl,
    detailUrl: notices.detailUrl,
  }).from(notices).where(and(...deadlineConditions)).orderBy(asc(notices.bidClose), asc(notices.bidNtceNo), asc(notices.ord)).limit(p.limit)
  const deadlines = deadlineRows.map((row) => ({
    id: `notice-${row.bidNtceNo}-${row.ord}`,
    noticeNo: row.bidNtceNo,
    ord: row.ord,
    title: row.title,
    agency: row.agency ?? '',
    bidClose: row.bidClose ?? null,
    opening: row.opening ?? null,
    amount: row.estimatedPrice ?? row.budgetAmt ?? null,
    url: row.detailUrl ?? row.noticeUrl ?? null,
  }))

  const rowTotals = await db.select({ kind: ingestJobs.kind, rows: sql<string>`coalesce(sum(${ingestJobs.rows}), 0)::bigint` }).from(ingestJobs).where(eq(ingestJobs.status, 'done')).groupBy(ingestJobs.kind)
  const totals = new Map(rowTotals.map((row) => [row.kind, countOf(row.rows)]))
  const sources = status.kinds.map((kind) => ({
    kind: kind.kind,
    state: sourceState(kind.kind, kind.done, kind.failed),
    latestChunkStart: kind.latestChunkStart,
    lastDoneAt: kind.lastDoneAt,
    rows: totals.get(kind.kind) ?? 0,
    pending: kind.pending,
    failed: kind.failed,
    done: kind.done,
  })) satisfies DashboardSource[]

  return {
    generatedAt: new Date().toISOString(),
    range: { from, to },
    award: { date: awardDate, lastDoneAt: awardStatus?.lastDoneAt ?? null, notices: countOf(awardNoticeRows[0]?.count), rows: countOf(awardRowRows[0]?.rows) },
    notice: { date: noticeDate, count: countOf(noticeCountRows[0]?.count) },
    keywords,
    deadlines,
    sources,
    stale: status.stale ?? [],
  }
}
