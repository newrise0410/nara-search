import { afterEach, describe, expect, it } from 'vitest'
import { ilike, sql } from 'drizzle-orm'
import { createTestDb } from '@nara/db/testing'
import { awards, bidders, notices } from '../schema'
import { ensurePartitions } from '../partitions'
import type { DbHandle } from '../client'

describe('database schema', () => {
  let handle: DbHandle | undefined
  afterEach(async () => { await handle?.close(); handle = undefined })

  it('마이그레이션과 월 파티션을 멱등하게 적용한다', async () => {
    handle = await createTestDb()
    expect(await ensurePartitions(handle.db, ['2026-08-15'])).toEqual(['awards_2026_08', 'bidders_2026_08'])
    expect(await ensurePartitions(handle.db, ['2026-08-15'])).toEqual(['awards_2026_08', 'bidders_2026_08'])
    const tables = await handle.db.execute(sql`select relname from pg_class where relname in ('awards_2026_08', 'bidders_2026_08')`) as unknown as { rows: unknown[] }
    expect(tables.rows).toHaveLength(2)
  })

  it('파티션 테이블에 insert와 같은 PK 업서트를 허용한다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values({ bidNtceNo: 'A', ord: '000', openingDate: '2026-08-15', title: '측량 장비' })
    await handle.db.insert(bidders).values({ bidNtceNo: 'A', awardOrd: '000', openingDate: '2026-08-15', bizNo: '123', rank: 1, won: true })
    await handle.db.insert(awards).values({ bidNtceNo: 'A', ord: '000', openingDate: '2026-08-15', title: '측량 장비 수정' }).onConflictDoUpdate({ target: [awards.bidNtceNo, awards.ord, awards.openingDate], set: { title: '측량 장비 수정' } })
    await handle.db.insert(bidders).values({ bidNtceNo: 'A', awardOrd: '000', openingDate: '2026-08-15', bizNo: '123', rank: 1, won: false }).onConflictDoUpdate({ target: [bidders.bidNtceNo, bidders.awardOrd, bidders.openingDate, bidders.bizNo, bidders.rank], set: { won: false } })
    expect(await handle.db.select().from(awards)).toHaveLength(1); expect(await handle.db.select().from(bidders)).toHaveLength(1)
  })

  it('금액 컬럼이 numeric(18,2)이고 파티션 자식까지 전파되며 소수점을 보존한다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    const columns = await handle.db.execute(sql`
      select table_name, data_type, numeric_precision, numeric_scale
      from information_schema.columns
      where table_name in ('awards', 'awards_2026_08') and column_name = 'final_amount'
    `) as unknown as { rows: { table_name: string; data_type: string; numeric_precision: number; numeric_scale: number }[] }
    expect(columns.rows).toEqual(expect.arrayContaining([
      { table_name: 'awards', data_type: 'numeric', numeric_precision: 18, numeric_scale: 2 },
      { table_name: 'awards_2026_08', data_type: 'numeric', numeric_precision: 18, numeric_scale: 2 },
    ]))

    await handle.db.insert(awards).values({
      bidNtceNo: 'MONEY', ord: '000', openingDate: '2026-08-15', title: '외자 낙찰',
      finalAmount: 123456.78, baseAmount: 128000.005,
    })
    await handle.db.insert(bidders).values({
      bidNtceNo: 'MONEY', awardOrd: '000', openingDate: '2026-08-15', bizNo: '123', rank: 1,
      amount: 123456.78,
    })

    const award = (await handle.db.select({ finalAmount: awards.finalAmount, baseAmount: awards.baseAmount }).from(awards))[0]
    const bidder = (await handle.db.select({ amount: bidders.amount }).from(bidders))[0]
    expect(award?.finalAmount).toBe(123456.78)
    expect(typeof award?.finalAmount).toBe('number')
    expect(award?.baseAmount).toBe(128000.01)
    expect(bidder?.amount).toBe(123456.78)
  })

  it('bidder_summary jsonb 컬럼이 파티션 자식까지 전파되고 값을 왕복한다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    const columns = await handle.db.execute(sql`
      select table_name, data_type
      from information_schema.columns
      where table_name in ('awards', 'awards_2026_08') and column_name = 'bidder_summary'
    `) as unknown as { rows: { table_name: string; data_type: string }[] }
    expect(columns.rows).toEqual(expect.arrayContaining([
      { table_name: 'awards', data_type: 'jsonb' },
      { table_name: 'awards_2026_08', data_type: 'jsonb' },
    ]))

    const summary = { n: 2, medianRate: 90.5, minRate: 88, maxRate: 93, top: [] }
    await handle.db.insert(awards).values({ bidNtceNo: 'SUMMARY', ord: '000', openingDate: '2026-08-15', bidderSummary: summary })
    const award = (await handle.db.select({ bidderSummary: awards.bidderSummary }).from(awards))[0]
    expect(award?.bidderSummary).toEqual(summary)
  })

  it('GIN trgm 인덱스가 있는 title ILIKE 검색을 반환한다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values({ bidNtceNo: 'A', ord: '000', openingDate: '2026-08-15', title: '하천 측량 용역' })
    expect(await handle.db.select().from(awards).where(ilike(awards.title, '%측량%'))).toHaveLength(1)
  })

  it('공고 첨부 컬럼이 기본값 []이고 jsonb 배열을 저장한다', async () => {
    handle = await createTestDb()
    await handle.db.insert(notices).values([
      { bidNtceNo: 'N1', ord: '000' },
      {
        bidNtceNo: 'N2',
        ord: '000',
        attachments: [{ url: 'https://f/1', name: 'a.hwp' }],
        detailUrl: 'https://d/N2',
        lowerLimitRate: 87.745,
        reNotice: true,
        source: 'bidpublic',
      },
    ])
    const rows = await handle.db.select().from(notices)
    const n1 = rows.find((row) => row.bidNtceNo === 'N1')
    const n2 = rows.find((row) => row.bidNtceNo === 'N2')
    expect(n1?.attachments).toEqual([])
    expect(n2?.attachments[0]?.name).toBe('a.hwp')
    expect(n2?.reNotice).toBe(true)
    expect(n2?.source).toBe('bidpublic')
  })

  it('사전규격 연결 컬럼과 prespec_no 부분 인덱스를 만든다', async () => {
    handle = await createTestDb()
    const columns = await handle.db.execute(sql`
      select data_type
      from information_schema.columns
      where table_name = 'notices' and column_name = 'prespec_linked_at'
    `) as unknown as { rows: { data_type: string }[] }
    expect(columns.rows).toEqual([{ data_type: 'timestamp with time zone' }])

    const indexes = await handle.db.execute(sql`
      select indexdef
      from pg_indexes
      where indexname = 'notices_prespec_no_idx'
    `) as unknown as { rows: { indexdef: string }[] }
    expect(indexes.rows).toHaveLength(1)
    expect(indexes.rows[0]?.indexdef.toUpperCase()).toContain('WHERE')
  })
})
