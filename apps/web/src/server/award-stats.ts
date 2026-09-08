import { BSNS_DIV_NM } from '@nara/api'
import { AWARD_STATS_ANY, AWARD_STATS_BUCKET_ANY, agencies, awardStats } from '@nara/db'
import type { NaraDb } from '@nara/db'
import { and, desc, eq, or } from 'drizzle-orm'
import { STATS_MIN_N, amountBucketOf, amountBucketRange } from 'worker'
import type { AwardStatsResult } from '@/lib/api-types'
import { won } from '@/lib/format'

export interface AwardStatsQuery {
  /** awards.ntce_instt_cd */
  agencyCode?: string | null
  /** 'Thng' | 'Servc' | 'Cnstwk' | 'Frgcpt' */
  bizDivKey?: string | null
  /** 추정가격(원). 없으면 금액 버킷 단계를 건너뛴다 */
  amount?: number | null
  /** awards.award_method */
  awardMethod?: string | null
}

type CandidateLevel = 0 | 1 | 2 | 3 | 4

interface Candidate {
  level: CandidateLevel
  key: string
  condition: NonNullable<ReturnType<typeof and>>
}

/** 드라이버가 반환하는 Date·문자열 날짜를 응답용 YYYY-MM-DD로 맞춘다 */
function dateValue(value: unknown): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/** 드라이버가 반환하는 Date·문자열 시각을 응답용 ISO 문자열로 맞춘다 */
function isoValue(value: unknown): string | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function nullableNumber(value: number | null): number | null {
  return value == null ? null : Number(value)
}

function amountLabel(bucket: number): string {
  const range = amountBucketRange(bucket)
  if (!range) return ''
  return range.to == null ? `${won(range.from)}원 이상` : `${won(range.from)}원~${won(range.to)}원`
}

function labelOf(row: { level: number; agencyCode: string; agencyName: string | null; bizDivKey: string; amountBucket: number; awardMethod: string }): string {
  if (row.level === 0) return '전체'
  const pieces: string[] = []
  if (row.level >= 4) pieces.push(row.agencyName || row.agencyCode)
  if (row.level >= 1) pieces.push(BSNS_DIV_NM[row.bizDivKey as keyof typeof BSNS_DIV_NM] ?? row.bizDivKey)
  if (row.level >= 3) pieces.push(amountLabel(row.amountBucket))
  if (row.level >= 2) pieces.push(row.awardMethod)
  return pieces.join(' · ')
}

function cellKeyOf(level: number, agencyCode: string, bizDivKey: string, amountBucket: number, awardMethod: string): string {
  return `${level}\0${agencyCode}\0${bizDivKey}\0${amountBucket}\0${awardMethod}`
}

function candidateOf(level: CandidateLevel, agencyCode: string, bizDivKey: string, amountBucket: number, awardMethod: string): Candidate {
  return {
    level,
    key: cellKeyOf(level, agencyCode, bizDivKey, amountBucket, awardMethod),
    condition: and(
      eq(awardStats.level, level), eq(awardStats.agencyCode, agencyCode), eq(awardStats.bizDivKey, bizDivKey),
      eq(awardStats.amountBucket, amountBucket), eq(awardStats.awardMethod, awardMethod),
    )!,
  }
}

function candidatesOf(query: AwardStatsQuery): Candidate[] {
  const agencyCode = clean(query.agencyCode)
  const bizDivKey = clean(query.bizDivKey)
  const awardMethod = clean(query.awardMethod)
  const amountBucket = query.amount == null ? null : amountBucketOf(query.amount)
  const candidates: Candidate[] = []

  if (agencyCode && bizDivKey && amountBucket != null && amountBucket >= 0 && awardMethod) {
    candidates.push(candidateOf(4, agencyCode, bizDivKey, amountBucket, awardMethod))
  }
  if (bizDivKey && amountBucket != null && amountBucket >= 0 && awardMethod) {
    candidates.push(candidateOf(3, AWARD_STATS_ANY, bizDivKey, amountBucket, awardMethod))
  }
  if (bizDivKey && awardMethod) {
    candidates.push(candidateOf(2, AWARD_STATS_ANY, bizDivKey, AWARD_STATS_BUCKET_ANY, awardMethod))
  }
  if (bizDivKey) {
    candidates.push(candidateOf(1, AWARD_STATS_ANY, bizDivKey, AWARD_STATS_BUCKET_ANY, AWARD_STATS_ANY))
  }
  candidates.push(candidateOf(0, AWARD_STATS_ANY, AWARD_STATS_ANY, AWARD_STATS_BUCKET_ANY, AWARD_STATS_ANY))
  return candidates
}

function selectRows(db: NaraDb, conditions: NonNullable<ReturnType<typeof and>>[]) {
  return db.select({
    level: awardStats.level,
    agencyCode: awardStats.agencyCode,
    bizDivKey: awardStats.bizDivKey,
    amountBucket: awardStats.amountBucket,
    awardMethod: awardStats.awardMethod,
    windowFrom: awardStats.windowFrom,
    windowTo: awardStats.windowTo,
    n: awardStats.n,
    rateP10: awardStats.rateP10,
    rateP25: awardStats.rateP25,
    rateP50: awardStats.rateP50,
    rateP75: awardStats.rateP75,
    rateP90: awardStats.rateP90,
    rateAvg: awardStats.rateAvg,
    marginN: awardStats.marginN,
    marginP10: awardStats.marginP10,
    marginP25: awardStats.marginP25,
    marginP50: awardStats.marginP50,
    marginP75: awardStats.marginP75,
    marginP90: awardStats.marginP90,
    marginAvg: awardStats.marginAvg,
    lowerLimitP50: awardStats.lowerLimitP50,
    computedAt: awardStats.computedAt,
    agencyName: agencies.name,
  }).from(awardStats)
    .leftJoin(agencies, eq(agencies.code, awardStats.agencyCode))
    .where(or(...conditions))
    .orderBy(desc(awardStats.level))
}

type AwardStatsRow = Awaited<ReturnType<typeof selectRows>>[number]

function resultOf(selected: AwardStatsRow, candidates: Candidate[]): AwardStatsResult {
  const level = selected.level as CandidateLevel
  const amountRange = level >= 3 ? amountBucketRange(selected.amountBucket) : null
  const rate = {
    p10: nullableNumber(selected.rateP10), p25: nullableNumber(selected.rateP25), p50: nullableNumber(selected.rateP50),
    p75: nullableNumber(selected.rateP75), p90: nullableNumber(selected.rateP90), avg: nullableNumber(selected.rateAvg),
  }
  const margin = {
    n: Number(selected.marginN), p10: nullableNumber(selected.marginP10), p25: nullableNumber(selected.marginP25),
    p50: nullableNumber(selected.marginP50), p75: nullableNumber(selected.marginP75), p90: nullableNumber(selected.marginP90),
    avg: nullableNumber(selected.marginAvg),
  }
  const windowFrom = dateValue(selected.windowFrom) ?? ''
  const windowTo = dateValue(selected.windowTo) ?? ''
  const computedAt = isoValue(selected.computedAt) ?? ''
  const fallbackFrom = candidates.map((candidate) => candidate.level).filter((candidateLevel) => candidateLevel > level).sort((a, b) => b - a)
  const basis = {
    level,
    label: labelOf(selected),
    agencyCode: level >= 4 ? selected.agencyCode : null,
    agencyName: level >= 4 ? selected.agencyName || null : null,
    bizDivKey: level >= 1 ? selected.bizDivKey : null,
    amountBucket: level >= 3 ? selected.amountBucket : null,
    amountRange,
    awardMethod: level >= 2 ? selected.awardMethod : null,
    n: Number(selected.n),
    sufficient: Number(selected.n) >= STATS_MIN_N,
    fallbackFrom,
    window: { from: windowFrom, to: windowTo },
    computedAt,
  }
  return {
    rate,
    margin,
    lowerLimitP50: nullableNumber(selected.lowerLimitP50),
    recommended: rate.p25 != null && rate.p75 != null ? { from: rate.p25, to: rate.p75 } : null,
    basis,
  }
}

/** 여러 셀 조건을 DB 왕복 1회로 조회한다. 반환 배열은 queries와 같은 길이·순서 */
export async function loadAwardStatsMany(db: NaraDb, queries: AwardStatsQuery[]): Promise<(AwardStatsResult | null)[]> {
  if (queries.length === 0) return []

  const candidateLists = queries.map(candidatesOf)
  const conditionByKey = new Map<string, NonNullable<ReturnType<typeof and>>>()
  for (const candidates of candidateLists) {
    for (const candidate of candidates) conditionByKey.set(candidate.key, candidate.condition)
  }

  const rows = await selectRows(db, [...conditionByKey.values()])
  const rowsByKey = new Map<string, AwardStatsRow>()
  for (const row of rows) rowsByKey.set(cellKeyOf(row.level, row.agencyCode, row.bizDivKey, row.amountBucket, row.awardMethod), row)

  return candidateLists.map((candidates) => {
    const orderedRows = candidates
      .map((candidate) => rowsByKey.get(candidate.key))
      .filter((row): row is AwardStatsRow => row != null)
    if (orderedRows.length === 0) return null
    const selected = orderedRows.find((row) => Number(row.n) >= STATS_MIN_N) ?? orderedRows[orderedRows.length - 1]
    return selected ? resultOf(selected, candidates) : null
  })
}

/** n<30이면 기관 → 금액버킷 → 낙찰방법 순으로 상위 차원에 폴백해 통계를 고른다 */
export async function loadAwardStats(db: NaraDb, query: AwardStatsQuery): Promise<AwardStatsResult | null> {
  const results = await loadAwardStatsMany(db, [query])
  return results[0] ?? null
}
