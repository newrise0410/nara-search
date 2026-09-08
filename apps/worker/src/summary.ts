import { sql } from 'drizzle-orm'
import { day, num, str, yn } from '@nara/api'
import type { AwardRow, PrespecBizDiv } from '@nara/api'
import { resultRows } from '@nara/db'
import type { BidderSummary, BidderSummaryTop, NaraDb } from '@nara/db'
import { awardValueOf, mergeAwardFields, upsertAwardSummaryRows } from './upsert'

/** 투찰 행이 하나도 없는 낙찰에 채우는 값 */
export const EMPTY_BIDDER_SUMMARY: BidderSummary = { n: 0, medianRate: null, minRate: null, maxRate: null, top: [] }
/** top 배열 최대 길이 */
export const SUMMARY_TOP_N = 3
/** 투찰율 반올림 자릿수 — SQL 경로와 JS 경로가 같은 값을 내야 한다 */
export const RATE_SCALE = 4

export interface BuildSummariesOptions {
  /** 개찰일 하한 (포함) */
  from: string
  /** 개찰일 상한 (포함) */
  to: string
  /** 주면 그 업무구분 공고만 갱신한다 */
  bizDivKey?: PrespecBizDiv
  /** true면 bidder_summary가 NULL인 낙찰만 갱신한다(prune 직전 보강용). 기본 false */
  onlyMissing?: boolean
}

export interface BuildSummariesResult {
  /** 투찰 행에서 요약을 만든 공고 수 */
  updated: number
  /** 투찰 행이 없어 빈 요약을 채운 공고 수 */
  empty: number
}

/** 개찰일 범위의 awards.bidder_summary 를 bidders 집계로 채운다. 몇 번 돌려도 같은 결과(멱등) */
export async function buildBidderSummaries(db: NaraDb, opts: BuildSummariesOptions): Promise<BuildSummariesResult> {
  const updateConditions = [
    sql`a."bid_ntce_no" = agg."bid_ntce_no"`,
    sql`a."ord" = agg."award_ord"`,
    sql`a."opening_date" = agg."opening_date"`,
  ]
  if (opts.bizDivKey) updateConditions.push(sql`a."biz_div_key" = ${opts.bizDivKey}`)
  if (opts.onlyMissing) updateConditions.push(sql`a."bidder_summary" IS NULL`)

  const updatedRows = resultRows<{ n: number | string }>(await db.execute(sql`
    WITH ranked AS (
      SELECT b."bid_ntce_no", b."award_ord", b."opening_date", b."rank", b."biz_no", b."amount", b."rate", b."won",
             coalesce(c."name", '') AS company_name,
             row_number() OVER (
               PARTITION BY b."bid_ntce_no", b."award_ord", b."opening_date"
               ORDER BY CASE WHEN b."rank" <= 0 THEN 2147483647 ELSE b."rank" END, b."biz_no"
             ) AS rn
      FROM "bidders" b
      LEFT JOIN "companies" c ON c."biz_no" = b."biz_no"
      WHERE b."opening_date" >= ${opts.from} AND b."opening_date" <= ${opts.to}
    ), agg AS (
      SELECT "bid_ntce_no", "award_ord", "opening_date",
             count(*)::int AS n,
             round(percentile_cont(0.5) WITHIN GROUP (ORDER BY "rate")::numeric, 4)::double precision AS median_rate,
             round(min("rate")::numeric, 4)::double precision AS min_rate,
             round(max("rate")::numeric, 4)::double precision AS max_rate,
             coalesce(jsonb_agg(jsonb_build_object(
               'rank', "rank", 'bizNo', "biz_no", 'name', company_name,
               'amount', "amount", 'rate', "rate", 'won', "won"
             ) ORDER BY rn) FILTER (WHERE rn <= 3), '[]'::jsonb) AS top
      FROM ranked GROUP BY 1, 2, 3
    ), updated AS (
      UPDATE "awards" a
      SET "bidder_summary" = jsonb_build_object(
            'n', agg.n, 'medianRate', agg.median_rate, 'minRate', agg.min_rate, 'maxRate', agg.max_rate, 'top', agg.top)
      FROM agg
      WHERE ${sql.join(updateConditions, sql` AND `)}
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM updated
  `))

  const filledConditions = [
    sql`"opening_date" >= ${opts.from}`,
    sql`"opening_date" <= ${opts.to}`,
    sql`"bidder_summary" IS NULL`,
  ]
  if (opts.bizDivKey) filledConditions.push(sql`"biz_div_key" = ${opts.bizDivKey}`)
  const emptyRows = resultRows<{ n: number | string }>(await db.execute(sql`
    WITH filled AS (
      UPDATE "awards"
      SET "bidder_summary" = '{"n":0,"medianRate":null,"minRate":null,"maxRate":null,"top":[]}'::jsonb
      WHERE ${sql.join(filledConditions, sql` AND `)}
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM filled
  `))
  return { updated: Number(updatedRows[0]?.n ?? 0), empty: Number(emptyRows[0]?.n ?? 0) }
}

/** 투찰 행은 있는데 요약이 없는 낙찰 수 — prune의 안전 검사 */
export async function missingSummaryCount(db: NaraDb, opts: { from: string; to: string }): Promise<number> {
  const rows = resultRows<{ n: number | string }>(await db.execute(sql`
    SELECT count(*)::int AS n
    FROM "awards" a
    WHERE a."opening_date" >= ${opts.from} AND a."opening_date" <= ${opts.to} AND a."bidder_summary" IS NULL
      AND EXISTS (SELECT 1 FROM "bidders" b
                  WHERE b."bid_ntce_no" = a."bid_ntce_no" AND b."award_ord" = a."ord" AND b."opening_date" = a."opening_date")
  `))
  return Number(rows[0]?.n ?? 0)
}

/** 누적기 안의 투찰 1행. bidders 테이블의 PK 중복 제거(bizNo|rank, 나중 값 우선)와 같은 규칙을 쓴다 */
export interface AccumBidder { rank: number; bizNo: string; name: string; amount: number | null; rate: number | null; won: boolean }

export interface AwardAccumEntry {
  /** 헤더 필드가 병합된 대표 행 */
  row: AwardRow
  /** key = `${bizNo}|${rank}` */
  bidders: Map<string, AccumBidder>
}

/** key = `${bidNtceNo}|${ord}|${openingDate}` */
export type AwardAccumulator = Map<string, AwardAccumEntry>

const skippedRows = new WeakMap<AwardAccumulator, number>()

export const newAwardAccumulator = (): AwardAccumulator => new Map()

/** 한 페이지의 원본 행을 누적기에 접는다. 같은 공고가 페이지 경계에 걸쳐도 같은 키로 합쳐진다 */
export function addAwardRows(acc: AwardAccumulator, rows: AwardRow[]): void {
  for (const row of rows) {
    const openingDate = day(row.opengDate)
    if (!openingDate) {
      skippedRows.set(acc, (skippedRows.get(acc) ?? 0) + 1)
      continue
    }
    const key = `${str(row.bidNtceNo) ?? ''}|${str(row.bidNtceOrd) ?? '000'}|${openingDate}`
    let entry = acc.get(key)
    if (!entry) {
      entry = { row: { ...row }, bidders: new Map() }
      acc.set(key, entry)
    } else mergeAwardFields(entry.row, row)
    if (str(row.bidprcCorpNm)) {
      const bizNo = str(row.bidprcCorpBizrno) ?? ''
      const rank = num(row.opengRank) ?? 0
      entry.bidders.set(`${bizNo}|${rank}`, {
        rank,
        bizNo,
        name: str(row.bidprcCorpNm) ?? '',
        amount: num(row.bidprcAmt) ?? null,
        rate: num(row.bidprcRt) ?? null,
        won: yn(row.sucsfYn),
      })
    }
  }
}

/** 누적 엔트리 하나를 요약으로 환산한다. buildBidderSummaries(SQL)와 같은 값을 내야 한다 */
export function summaryOf(entry: AwardAccumEntry): BidderSummary {
  const list = [...entry.bidders.values()]
  const rates = list.map((bidder) => bidder.rate).filter((value): value is number => value != null)
  const round4 = (value: number) => Math.round(value * 10 ** RATE_SCALE) / 10 ** RATE_SCALE
  let medianRate: number | null = null
  let minRate: number | null = null
  let maxRate: number | null = null
  if (rates.length) {
    const sortedRates = [...rates].sort((a, b) => a - b)
    const middle = Math.floor(sortedRates.length / 2)
    const median = sortedRates.length % 2 ? sortedRates[middle]! : (sortedRates[middle - 1]! + sortedRates[middle]!) / 2
    medianRate = round4(median)
    minRate = round4(sortedRates[0]!)
    maxRate = round4(sortedRates[sortedRates.length - 1]!)
  }
  const top = [...list].sort((a, b) => {
    const rankA = a.rank <= 0 ? 2147483647 : a.rank
    const rankB = b.rank <= 0 ? 2147483647 : b.rank
    if (rankA !== rankB) return rankA - rankB
    return a.bizNo < b.bizNo ? -1 : a.bizNo > b.bizNo ? 1 : 0
  }).slice(0, SUMMARY_TOP_N).map((bidder): BidderSummaryTop => ({ ...bidder }))
  return { n: list.length, medianRate, minRate, maxRate, top }
}

/** 누적기를 awards 업서트로 flush 한다. bidders에는 쓰지 않는다 */
export async function flushAwardSummaries(db: NaraDb, acc: AwardAccumulator, bizDivKey: PrespecBizDiv): Promise<{ awards: number; skipped: number }> {
  const values = [...acc.values()].map((entry) => ({
    ...awardValueOf(entry.row, bizDivKey),
    bidderSummary: summaryOf(entry),
    bidderCount: entry.bidders.size,
  }))
  const awards = await upsertAwardSummaryRows(db, values)
  return { awards, skipped: skippedRows.get(acc) ?? 0 }
}
