import { and, gte, inArray, lte, sql } from 'drizzle-orm'
import { awards, bidders, companies, contracts } from '@nara/db'
import type { NaraDb } from '@nara/db'
import { hyphenBizNo, plainBizNo } from '@/lib/biz-no'
import type { CompetitorStats } from '@/lib/api-types'

export const MAX_COMPETITORS = 50

function dateValue(value: unknown): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/** 사업자번호를 awards·bidders·companies에 저장된 표기로 펼쳐 정합성을 맞춘다. */
export function candidatesFor(bizNo: string): string[] {
  const numeric = plainBizNo(bizNo)
  return [...new Set([bizNo, numeric, hyphenBizNo(bizNo)].filter(Boolean))]
}

/** 파티션 프루닝을 위해 날짜 범위 조건을 공통 형태로 만든다. */
export function rangeFor(column: typeof bidders.openingDate | typeof awards.openingDate | typeof contracts.concludeDate, range?: { from?: string; to?: string }) {
  const conditions = []
  if (range?.from) conditions.push(gte(column, range.from))
  if (range?.to) conditions.push(lte(column, range.to))
  return conditions
}

function valuesFor<T extends { bizNo?: string | null }>(rows: T[], keys: string[]): T[] {
  return rows.filter((row) => row.bizNo != null && keys.includes(row.bizNo))
}

/** bizNos 는 요청에 들어온 원본 문자열들. 최대 MAX_COMPETITORS 개 */
export async function loadCompetitorStats(
  db: NaraDb,
  bizNos: string[],
  range?: { from?: string; to?: string },
): Promise<CompetitorStats[]> {
  const inputs = bizNos.slice(0, MAX_COMPETITORS)
  if (inputs.length === 0) return []
  const candidates = [...new Set(inputs.flatMap(candidatesFor))]

  const bidderRows = await db.select({
    bizNo: bidders.bizNo,
    participated: sql<number>`count(*)::int`,
    bidRate: sql<number | null>`avg(${bidders.rate})::double precision`,
    lastSeen: sql<string | null>`max(${bidders.openingDate})`,
  }).from(bidders).where(and(inArray(bidders.bizNo, candidates), ...rangeFor(bidders.openingDate, range))).groupBy(bidders.bizNo)
  const awardRows = await db.select({
    bizNo: awards.winnerBizNo,
    won: sql<number>`count(*)::int`,
    amount: sql<string | null>`sum(${awards.finalAmount})`,
    winRate: sql<number | null>`avg(${awards.finalRate})::double precision`,
    lastSeen: sql<string | null>`max(${awards.openingDate})`,
  }).from(awards).where(and(inArray(awards.winnerBizNo, candidates), ...rangeFor(awards.openingDate, range))).groupBy(awards.winnerBizNo)
  const contractRows = await db.select({
    bizNo: contracts.companyBizNo,
    contracts: sql<number>`count(*)::int`,
    amount: sql<string | null>`sum(${contracts.amount})`,
    lastSeen: sql<string | null>`max(${contracts.concludeDate})`,
  }).from(contracts).where(and(inArray(contracts.companyBizNo, candidates), ...rangeFor(contracts.concludeDate, range))).groupBy(contracts.companyBizNo)
  const agencyRows = await db.select({
    bizNo: awards.winnerBizNo,
    agency: awards.ntceInsttNm,
    count: sql<number>`count(*)::int`,
  }).from(awards).where(and(inArray(awards.winnerBizNo, candidates), ...rangeFor(awards.openingDate, range))).groupBy(awards.winnerBizNo, awards.ntceInsttNm)
  const companyRows = await db.select({ bizNo: companies.bizNo, name: companies.name }).from(companies).where(inArray(companies.bizNo, candidates))

  return inputs.map((bizNo) => {
    const keys = candidatesFor(bizNo)
    const bidder = valuesFor(bidderRows, keys)
    const award = valuesFor(awardRows, keys)
    const contract = valuesFor(contractRows, keys)
    const agencies = agencyRows.filter((row) => row.bizNo != null && keys.includes(row.bizNo))
      .filter((row) => row.agency)
      .sort((a, b) => Number(b.count) - Number(a.count) || (a.agency ?? '').localeCompare(b.agency ?? ''))
      .slice(0, 3)
      .map((row) => row.agency!)
    const names = companyRows.filter((row) => keys.includes(row.bizNo)).map((row) => row.name).filter(Boolean)
    const participated = bidder.reduce((sum, row) => sum + Number(row.participated ?? 0), 0)
    const won = award.reduce((sum, row) => sum + Number(row.won ?? 0), 0)
    const contractCount = contract.reduce((sum, row) => sum + Number(row.contracts ?? 0), 0)
    const amount = award.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) + contract.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
    const bidRates = bidder.map((row) => row.bidRate).filter((value): value is number => value != null)
    const winRates = award.map((row) => row.winRate).filter((value): value is number => value != null)
    const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null
    const seen = [...bidder, ...award, ...contract].map((row) => dateValue(row.lastSeen)).filter((value): value is string => value != null).sort().at(-1) ?? null
    return {
      bizNo,
      name: names[0] ?? '',
      participated,
      won,
      contracts: contractCount,
      amount,
      bidRate: average(bidRates),
      winRate: average(winRates),
      agencies,
      lastSeen: seen,
    }
  })
}
