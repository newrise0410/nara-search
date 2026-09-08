import { monthsAgo, today } from '@nara/api'
import { and, asc, desc, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import { awards, companies, resultRows } from '@nara/db'
import type { NaraDb } from '@nara/db'
import type { CompanyProfile } from '@/lib/api-types'
import { plainBizNo } from '@/lib/biz-no'
import { candidatesFor, rangeFor } from '@/server/competitors'

/** 기본 조회 구간 길이(개월). 달 경계로 잘라 12개 버킷이 나온다 */
export const PROFILE_MONTHS = 12

/** 11개월 전 1일 ~ 오늘 */
export function defaultProfileRange(): { from: string; to: string } {
  const to = today()
  return { from: `${monthsAgo(PROFILE_MONTHS - 1).slice(0, 7)}-01`, to }
}

/** 주요 발주기관 최대 개수 */
export const PROFILE_AGENCY_LIMIT = 10
/** 최근 낙찰 최대 건수 */
export const PROFILE_RECENT_LIMIT = 20
/** 동반 노출 업체 최대 개수 */
export const PROFILE_PEER_LIMIT = 10

/** 드라이버별 Date·문자열 날짜를 화면용 YYYY-MM-DD로 맞춘다. */
const dateValue = (value: unknown): string | null => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)

/** 월 키를 다음 달로 이동해 중간에 누락된 집계 버킷을 채운다. */
function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber, 1))
  return date.toISOString().slice(0, 7)
}

/** 월별 결과 사이의 빈 달을 0 값으로 채운다. */
function fillMonths(rows: Array<{ month: string; won: number; amount: string | null; avgRate: number | null }>) {
  if (rows.length === 0) return []
  const byMonth = new Map(rows.map((row) => [row.month, row]))
  const months = []
  let month = rows[0].month
  const last = rows[rows.length - 1].month
  while (month <= last) {
    const row = byMonth.get(month)
    months.push({
      month,
      won: Number(row?.won ?? 0),
      amount: Number(row?.amount ?? 0),
      avgWinRate: row?.avgRate == null ? null : Number(row.avgRate),
    })
    month = nextMonth(month)
  }
  return months
}

/** 업체 프로파일은 영구 보존되는 awards 헤더와 bidder_summary만으로 집계한다. */
export async function loadCompanyProfile(
  db: NaraDb,
  bizNo: string,
  range?: { from?: string; to?: string },
): Promise<CompanyProfile | null> {
  const plain = plainBizNo(bizNo)
  if (plain.length !== 10) return null

  const candidates = candidatesFor(bizNo)
  const defaultRange = defaultProfileRange()
  const from = range?.from ?? defaultRange.from
  const to = range?.to ?? defaultRange.to
  const awardWhere = and(inArray(awards.winnerBizNo, candidates), ...rangeFor(awards.openingDate, { from, to }))

  // 1) 업체 기본 정보 — 두 표기가 각각 행일 수 있어 biz_no 오름차순으로 받고 필드별 첫 비어있지 않은 값을 쓴다
  const companyRows = await db.select({ bizNo: companies.bizNo, name: companies.name, ceo: companies.ceo, address: companies.address, tel: companies.tel })
    .from(companies).where(inArray(companies.bizNo, candidates)).orderBy(asc(companies.bizNo))

  // 2) 합계
  const totalRows = await db.select({
    won: sql<number>`count(*)::int`,
    amount: sql<string | null>`sum(${awards.finalAmount})`,
    avgRate: sql<number | null>`avg(${awards.finalRate})::double precision`,
    agencies: sql<number>`count(distinct ${awards.ntceInsttNm})::int`,
    firstDate: sql<unknown>`min(${awards.openingDate})`,
    lastDate: sql<unknown>`max(${awards.openingDate})`,
  }).from(awards).where(awardWhere)

  // 3) 월별
  const monthExpr = sql<string>`to_char(${awards.openingDate}, 'YYYY-MM')`
  const monthRows = await db.select({
    month: monthExpr,
    won: sql<number>`count(*)::int`,
    amount: sql<string | null>`sum(${awards.finalAmount})`,
    avgRate: sql<number | null>`avg(${awards.finalRate})::double precision`,
  }).from(awards).where(awardWhere).groupBy(monthExpr).orderBy(monthExpr)

  // 4) 주요 발주기관 top10 (기관명이 비어 있는 행은 제외)
  const agencyRows = await db.select({
    agency: awards.ntceInsttNm,
    won: sql<number>`count(*)::int`,
    amount: sql<string | null>`sum(${awards.finalAmount})`,
  }).from(awards)
    .where(and(awardWhere, isNotNull(awards.ntceInsttNm), ne(awards.ntceInsttNm, '')))
    .groupBy(awards.ntceInsttNm)
    .orderBy(desc(sql`count(*)`), desc(sql`coalesce(sum(${awards.finalAmount}), 0)`), asc(awards.ntceInsttNm))
    .limit(PROFILE_AGENCY_LIMIT)

  // 5) 최근 낙찰 20건
  const recentRows = await db.select({
    bidNtceNo: awards.bidNtceNo, ord: awards.ord, openingDate: awards.openingDate,
    title: awards.title, agency: awards.ntceInsttNm, bizDiv: awards.bizDiv,
    winnerName: awards.winnerName, finalAmount: awards.finalAmount, finalRate: awards.finalRate,
  }).from(awards).where(awardWhere)
    .orderBy(desc(awards.openingDate), desc(awards.bidNtceNo), desc(awards.ord))
    .limit(PROFILE_RECENT_LIMIT)

  // 6-a) 상위권 노출 지표
  const exposureRows = resultRows<{ appearances: number | string; won: number | string; avg_rate: number | null }>(await db.execute(sql`
  SELECT count(*)::int AS appearances,
         count(*) FILTER (WHERE (e->>'won')::boolean)::int AS won,
         avg((e->>'rate')::double precision) AS avg_rate
  FROM "awards" a
  CROSS JOIN LATERAL jsonb_array_elements(a."bidder_summary"->'top') e
  WHERE a."opening_date" >= ${from} AND a."opening_date" <= ${to}
    AND a."bidder_summary" IS NOT NULL
    AND e->>'bizNo' = ${plain}
  `))

  // 6-b) 상위권 동반 노출 업체 top10
  const peerRows = resultRows<{ biz_no: string; name: string | null; together: number | string }>(await db.execute(sql`
  SELECT e->>'bizNo' AS biz_no, max(e->>'name') AS name, count(*)::int AS together
  FROM "awards" a
  CROSS JOIN LATERAL jsonb_array_elements(a."bidder_summary"->'top') e
  WHERE a."opening_date" >= ${from} AND a."opening_date" <= ${to}
    AND a."bidder_summary" IS NOT NULL
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(a."bidder_summary"->'top') m WHERE m->>'bizNo' = ${plain})
    AND coalesce(e->>'bizNo', '') <> '' AND e->>'bizNo' <> ${plain}
  GROUP BY 1
  ORDER BY together DESC, biz_no
  LIMIT ${PROFILE_PEER_LIMIT}
  `))

  const total = totalRows[0]
  const totals = {
    won: Number(total?.won ?? 0),
    amount: Number(total?.amount ?? 0),
    avgWinRate: total?.avgRate == null ? null : Number(total.avgRate),
    agencies: Number(total?.agencies ?? 0),
    firstAwardDate: dateValue(total?.firstDate),
    lastAwardDate: dateValue(total?.lastDate),
  }
  const months = fillMonths(monthRows)
  const agencies = agencyRows.map((row) => ({ agency: row.agency ?? '', won: Number(row.won ?? 0), amount: Number(row.amount ?? 0) }))
  const recent = recentRows.map((row) => ({
    id: `award-${row.bidNtceNo}-${row.ord}`,
    noticeNo: row.bidNtceNo,
    ord: row.ord,
    openingDate: dateValue(row.openingDate) ?? '',
    title: row.title,
    agency: row.agency ?? '',
    bizDiv: row.bizDiv,
    amount: row.finalAmount == null ? null : Number(row.finalAmount),
    rate: row.finalRate == null ? null : Number(row.finalRate),
  }))
  const exposure = exposureRows[0]
  const exposureResult = {
    appearances: Number(exposure?.appearances ?? 0),
    won: Number(exposure?.won ?? 0),
    avgRate: exposure?.avg_rate == null ? null : Number(exposure.avg_rate),
  }
  const peers = peerRows.map((row) => {
    const peerBizNo = plainBizNo(row.biz_no)
    return { bizNo: peerBizNo, name: row.name || peerBizNo, together: Number(row.together ?? 0) }
  })

  if (companyRows.length === 0 && totals.won === 0 && exposureResult.appearances === 0) return null

  const firstName = companyRows.map((row) => row.name).find((value) => value.trim() !== '')
  const firstNonNull = (values: Array<string | null>) => values.find((value): value is string => value != null) ?? null
  return {
    bizNo,
    plainBizNo: plain,
    name: firstName ?? recentRows[0]?.winnerName ?? '',
    ceo: firstNonNull(companyRows.map((row) => row.ceo)),
    address: firstNonNull(companyRows.map((row) => row.address)),
    tel: firstNonNull(companyRows.map((row) => row.tel)),
    range: { from, to },
    totals,
    months,
    agencies,
    recent,
    peers,
    exposure: exposureResult,
  }
}
