import { addDays, addMonths } from '@nara/api'
import { AWARD_STATS_BUCKET_ANY, resultRows } from '@nara/db'
import type { NaraDb } from '@nara/db'
import { sql } from 'drizzle-orm'

/** 집계 창 길이(개월). 창 = [--month의 (n-1)개월 전 1일, --month 말일] */
export const STATS_WINDOW_MONTHS = 12
/** 이 값 미만이면 loadAwardStats가 상위 차원으로 폴백한다 */
export const STATS_MIN_N = 30
/** 금액 로그버킷 클램프 하한/상한 (실측 분포 근거: 10^5 미만 7건, 10^10 초과 2건) */
export const AMOUNT_BUCKET_MIN = 5
export const AMOUNT_BUCKET_MAX = 10

/** 추정가격(원)을 SQL 집계식과 같은 로그버킷으로 환산한다 */
export function amountBucketOf(amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return AWARD_STATS_BUCKET_ANY
  return Math.min(Math.max(Math.floor(Math.log10(amount)), AMOUNT_BUCKET_MIN), AMOUNT_BUCKET_MAX)
}

/** 로그버킷을 금액 범위로 바꾼다. 최상위 버킷은 상한을 두지 않는다 */
export function amountBucketRange(bucket: number): { from: number; to: number | null } | null {
  if (bucket < 0) return null
  return { from: 10 ** bucket, to: bucket >= AMOUNT_BUCKET_MAX ? null : 10 ** (bucket + 1) }
}

/** 'YYYY-MM' 끝 달을 포함하는 집계 창을 계산한다 */
export function statsWindow(month: string, windowMonths = STATS_WINDOW_MONTHS): { from: string; to: string } {
  const monthStart = `${month}-01`
  return {
    from: addMonths(monthStart, -(windowMonths - 1)),
    to: addDays(addMonths(monthStart, 1), -1),
  }
}

/** awards의 최신 개찰월을 찾되 오늘 이후에 잡힌 미래 데이터는 제외한다 */
export async function latestAwardMonth(db: NaraDb, today = new Date().toISOString().slice(0, 10)): Promise<string | null> {
  const rows = resultRows<{ opening_date: string | Date | null }>(await db.execute(sql`
    SELECT max("opening_date")::text AS opening_date
    FROM "awards"
    WHERE "opening_date" >= DATE '0001-01-01' AND "opening_date" <= ${today}
  `))
  const openingDate = rows[0]?.opening_date
  if (!openingDate) return null
  return openingDate instanceof Date ? openingDate.toISOString().slice(0, 7) : String(openingDate).slice(0, 7)
}

export interface RebuildAwardStatsOptions {
  db: NaraDb
  /** 'YYYY-MM'. 창의 끝 달 */
  month: string
  /** 기본 STATS_WINDOW_MONTHS */
  windowMonths?: number
}

export interface RebuildAwardStatsResult {
  month: string
  window: { from: string; to: string }
  /** 집계 대상 원본 낙찰 수(level 0 셀의 n) */
  sourceRows: number
  /** 저장된 셀 총수 */
  cells: number
  /** level → 셀 수. 셀이 없는 level은 0 */
  byLevel: Record<'0' | '1' | '2' | '3' | '4', number>
  elapsedMs: number
}

interface AwardStatsSummaryRow {
  level: number | string
  cells: number | string
  max_n: number | string
}

/** award_stats 전체를 한 트랜잭션에서 창 집계 결과로 교체해 멱등성을 보장한다 */
export async function rebuildAwardStats(opts: RebuildAwardStatsOptions): Promise<RebuildAwardStatsResult> {
  const startedAt = Date.now()
  const window = statsWindow(opts.month, opts.windowMonths)
  const summaryRows = await opts.db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM "award_stats"`)
    await tx.execute(sql`
      INSERT INTO "award_stats" (
        "level","agency_code","biz_div_key","amount_bucket","award_method",
        "window_from","window_to","n",
        "rate_p_10","rate_p_25","rate_p_50","rate_p_75","rate_p_90","rate_avg",
        "margin_n","margin_p_10","margin_p_25","margin_p_50","margin_p_75","margin_p_90","margin_avg",
        "lower_limit_p_50","computed_at")
      WITH src AS (
        -- 반올림 자릿수 4는 summary.ts의 RATE_SCALE과 동일하고, 버킷 5~10은 AMOUNT_BUCKET_MIN/MAX와 동일하다.
        SELECT a."ntce_instt_cd" AS agency_code,
               a."biz_div_key"   AS biz_div_key,
               least(greatest(floor(log(10, a."estimated_price"))::int, 5), 10) AS amount_bucket,
               a."award_method"  AS award_method,
               a."final_rate"    AS rate,
               a."lower_limit_rate" AS llr,
               a."final_rate" - a."lower_limit_rate" AS margin
        FROM "awards" a
        WHERE a."opening_date" >= ${window.from} AND a."opening_date" <= ${window.to}
          AND a."final_rate" IS NOT NULL
          AND a."estimated_price" IS NOT NULL AND a."estimated_price" > 0
          AND coalesce(a."ntce_instt_cd", '') <> ''
          AND coalesce(a."biz_div_key", '') <> ''
          AND coalesce(a."award_method", '') <> ''
      )
      SELECT
        CASE WHEN grouping(agency_code)  = 0 THEN 4
             WHEN grouping(amount_bucket) = 0 THEN 3
             WHEN grouping(award_method) = 0 THEN 2
             WHEN grouping(biz_div_key)   = 0 THEN 1
             ELSE 0 END,
        CASE WHEN grouping(agency_code)  = 0 THEN agency_code  ELSE '*' END,
        CASE WHEN grouping(biz_div_key)  = 0 THEN biz_div_key  ELSE '*' END,
        CASE WHEN grouping(amount_bucket) = 0 THEN amount_bucket ELSE -1 END,
        CASE WHEN grouping(award_method) = 0 THEN award_method ELSE '*' END,
        ${window.from}::date, ${window.to}::date,
        count(*)::int,
        round(percentile_cont(0.10) WITHIN GROUP (ORDER BY rate)::numeric, 4)::double precision,
        round(percentile_cont(0.25) WITHIN GROUP (ORDER BY rate)::numeric, 4)::double precision,
        round(percentile_cont(0.50) WITHIN GROUP (ORDER BY rate)::numeric, 4)::double precision,
        round(percentile_cont(0.75) WITHIN GROUP (ORDER BY rate)::numeric, 4)::double precision,
        round(percentile_cont(0.90) WITHIN GROUP (ORDER BY rate)::numeric, 4)::double precision,
        round(avg(rate)::numeric, 4)::double precision,
        count(margin)::int,
        round(percentile_cont(0.10) WITHIN GROUP (ORDER BY margin)::numeric, 4)::double precision,
        round(percentile_cont(0.25) WITHIN GROUP (ORDER BY margin)::numeric, 4)::double precision,
        round(percentile_cont(0.50) WITHIN GROUP (ORDER BY margin)::numeric, 4)::double precision,
        round(percentile_cont(0.75) WITHIN GROUP (ORDER BY margin)::numeric, 4)::double precision,
        round(percentile_cont(0.90) WITHIN GROUP (ORDER BY margin)::numeric, 4)::double precision,
        round(avg(margin)::numeric, 4)::double precision,
        round(percentile_cont(0.50) WITHIN GROUP (ORDER BY llr)::numeric, 4)::double precision,
        now()
      FROM src
      GROUP BY GROUPING SETS (
        (agency_code, biz_div_key, amount_bucket, award_method),
        (biz_div_key, amount_bucket, award_method),
        (biz_div_key, award_method),
        (biz_div_key),
        ()
      )
      HAVING count(*) > 0
    `)
    return resultRows<AwardStatsSummaryRow>(await tx.execute(sql`
      SELECT "level", count(*)::int AS cells, max("n")::int AS max_n
      FROM "award_stats" GROUP BY 1 ORDER BY 1
    `))
  })

  const byLevel: Record<'0' | '1' | '2' | '3' | '4', number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 }
  let sourceRows = 0
  let cells = 0
  for (const row of summaryRows) {
    const level = Number(row.level)
    const count = Number(row.cells)
    const maxN = Number(row.max_n)
    if (level >= 0 && level <= 4) byLevel[String(level) as keyof typeof byLevel] = count
    cells += count
    if (level === 0) sourceRows = maxN
  }
  return { month: opts.month, window, sourceRows, cells, byLevel, elapsedMs: Date.now() - startedAt }
}
