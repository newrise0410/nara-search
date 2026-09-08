import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { awardStats, awards, ensurePartitions, resultRows } from '@nara/db'
import { createTestDb } from '@nara/db/testing'
import type { DbHandle, NaraDb } from '@nara/db'
import {
  amountBucketOf, latestAwardMonth, rebuildAwardStats, statsWindow,
} from '../stats'

describe('낙찰 통계 사전집계', () => {
  let handle: DbHandle | undefined
  afterEach(async () => { await handle?.close(); handle = undefined })

  const award = (id: string, openingDate: string, overrides: Record<string, unknown> = {}) => ({
    bidNtceNo: id,
    ord: '000',
    openingDate,
    bizDivKey: 'Servc',
    ntceInsttCd: 'AGENCY-1',
    awardMethod: '소액수의견적',
    estimatedPrice: 10_000_000,
    finalRate: 90,
    lowerLimitRate: 85,
    ...overrides,
  })

  const statsSnapshot = async (db: NaraDb) => {
    const rows = await db.select({
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
    }).from(awardStats)
    return rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }

  it('개찰일 창의 낙찰을 5단계 셀로 집계하고 level별 셀 수를 반환한다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values([
      award('A-1', '2026-08-15'),
      award('A-2', '2026-08-15', { ntceInsttCd: 'AGENCY-2', finalRate: 92 }),
    ])

    const result = await rebuildAwardStats({ db: handle.db, month: '2026-08' })
    expect(result).toMatchObject({ sourceRows: 2, cells: 6, byLevel: { '0': 1, '1': 1, '2': 1, '3': 1, '4': 2 } })
    expect((await handle.db.select().from(awardStats))).toHaveLength(6)
    expect((await handle.db.select().from(awardStats)).map((row) => row.level).sort()).toEqual([0, 1, 2, 3, 4, 4])
  })

  it('셀의 백분위가 같은 표본에 대한 원시 percentile_cont 결과와 일치한다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values([
      award('P-1', '2026-08-15', { finalRate: 80.12345, lowerLimitRate: 78 }),
      award('P-2', '2026-08-15', { finalRate: 90.55555, lowerLimitRate: 88 }),
      award('P-3', '2026-08-15', { finalRate: 100, lowerLimitRate: 95 }),
    ])
    await rebuildAwardStats({ db: handle.db, month: '2026-08' })

    const raw = resultRows<{ p10: number; p25: number; p50: number; p75: number; p90: number; avg: number }>(await handle.db.execute(sql`
      SELECT round(percentile_cont(0.10) WITHIN GROUP (ORDER BY final_rate)::numeric, 4)::double precision AS p10,
             round(percentile_cont(0.25) WITHIN GROUP (ORDER BY final_rate)::numeric, 4)::double precision AS p25,
             round(percentile_cont(0.50) WITHIN GROUP (ORDER BY final_rate)::numeric, 4)::double precision AS p50,
             round(percentile_cont(0.75) WITHIN GROUP (ORDER BY final_rate)::numeric, 4)::double precision AS p75,
             round(percentile_cont(0.90) WITHIN GROUP (ORDER BY final_rate)::numeric, 4)::double precision AS p90,
             round(avg(final_rate)::numeric, 4)::double precision AS avg
      FROM awards
      WHERE opening_date >= '2026-08-01' AND opening_date <= '2026-08-31'
        AND final_rate IS NOT NULL AND estimated_price IS NOT NULL AND estimated_price > 0
        AND coalesce(ntce_instt_cd, '') <> '' AND coalesce(biz_div_key, '') <> '' AND coalesce(award_method, '') <> ''
    `))
    const cell = (await handle.db.select().from(awardStats)).find((row) => row.level === 0)
    expect(cell).toBeDefined()
    expect({ p10: cell?.rateP10, p25: cell?.rateP25, p50: cell?.rateP50, p75: cell?.rateP75, p90: cell?.rateP90, avg: cell?.rateAvg }).toEqual(raw[0])
  })

  it('두 번 실행해도 셀 수와 값이 같다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values([
      award('IDEMP-1', '2026-08-15', { finalRate: 88.12345 }),
      award('IDEMP-2', '2026-08-15', { finalRate: 94.54321, ntceInsttCd: 'AGENCY-2' }),
    ])
    await rebuildAwardStats({ db: handle.db, month: '2026-08' })
    const first = await statsSnapshot(handle.db)
    await rebuildAwardStats({ db: handle.db, month: '2026-08' })
    const second = await statsSnapshot(handle.db)
    expect(second).toEqual(first)
  })

  it('하한율이 없는 낙찰은 margin_n에서 빠지고 rate 통계에는 남는다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values(award('MARGIN-NULL', '2026-08-15', { lowerLimitRate: null, finalRate: 91.25 }))
    await rebuildAwardStats({ db: handle.db, month: '2026-08' })
    const row = (await handle.db.select().from(awardStats)).find((item) => item.level === 0)
    expect(row).toMatchObject({ n: 1, rateP50: 91.25, marginN: 0, marginP50: null, lowerLimitP50: null })
  })

  it('추정가격이 없거나 0 이하인 낙찰은 집계 대상에서 제외한다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values([
      award('PRICE-NULL', '2026-08-15', { estimatedPrice: null }),
      award('PRICE-ZERO', '2026-08-15', { estimatedPrice: 0 }),
    ])
    const result = await rebuildAwardStats({ db: handle.db, month: '2026-08' })
    expect(result).toMatchObject({ sourceRows: 0, cells: 0, byLevel: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 } })
    expect(await handle.db.select().from(awardStats)).toEqual([])
  })

  it('금액 버킷은 5~10으로 클램프하고 amountBucketOf와 같은 값을 낸다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    const prices = [1e3, 1e5, 1e7, 1e10, 1e12]
    await handle.db.insert(awards).values(prices.map((estimatedPrice, index) => award(`BUCKET-${index}`, '2026-08-15', {
      ntceInsttCd: `BUCKET-AGENCY-${index}`, estimatedPrice,
    })))
    await rebuildAwardStats({ db: handle.db, month: '2026-08' })
    const rows = (await handle.db.select().from(awardStats)).filter((row) => row.level === 4)
      .sort((a, b) => a.agencyCode.localeCompare(b.agencyCode))
    expect(rows.map((row) => row.amountBucket)).toEqual([5, 5, 7, 10, 10])
    expect(rows.map((row) => row.amountBucket)).toEqual(prices.map(amountBucketOf))
  })

  it('창 밖 개찰일은 집계에 들어가지 않는다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-05-31', '2026-06-01', '2026-08-31'])
    await handle.db.insert(awards).values([
      award('WINDOW-OLD', '2026-05-31'),
      award('WINDOW-IN-1', '2026-06-01'),
      award('WINDOW-IN-2', '2026-08-31'),
    ])
    const result = await rebuildAwardStats({ db: handle.db, month: '2026-08', windowMonths: 3 })
    expect(result).toMatchObject({ sourceRows: 2, window: statsWindow('2026-08', 3) })
    expect((await handle.db.select().from(awardStats)).find((row) => row.level === 0)?.n).toBe(2)
  })

  it('awards가 비어 있으면 셀을 하나도 만들지 않는다', async () => {
    handle = await createTestDb()
    const result = await rebuildAwardStats({ db: handle.db, month: '2026-08' })
    expect(result).toMatchObject({ sourceRows: 0, cells: 0, byLevel: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 } })
    expect(await handle.db.select().from(awardStats)).toEqual([])
  })

  it('latestAwardMonth는 오늘 이후 개찰일을 무시하고 최신 월을 돌려준다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-07-31', '2026-08-31', '2026-09-01'])
    await handle.db.insert(awards).values([
      award('LATEST-OLD', '2026-07-31'),
      award('LATEST-CURRENT', '2026-08-31'),
      award('LATEST-FUTURE', '2026-09-01'),
    ])
    expect(await latestAwardMonth(handle.db, '2026-08-31')).toBe('2026-08')
  })
})
