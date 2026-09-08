import { afterEach, describe, expect, it } from 'vitest'
import { createTestDb } from '@nara/db/testing'
import { awards, bidders, companies, ensurePartitions } from '@nara/db'
import type { DbHandle } from '@nara/db'
import type { AwardRow } from '@nara/api'
import { upsertAwardPage } from '../upsert'
import {
  EMPTY_BIDDER_SUMMARY, addAwardRows, buildBidderSummaries, newAwardAccumulator, summaryOf,
} from '../summary'

describe('투찰 요약', () => {
  let handle: DbHandle | undefined
  afterEach(async () => { await handle?.close(); handle = undefined })

  it('개찰일 범위의 투찰을 공고별 요약으로 채우고 두 번 실행해도 같은 값이다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values({ bidNtceNo: 'A', ord: '000', openingDate: '2026-08-15', bizDivKey: 'Servc' })
    await handle.db.insert(companies).values([
      { bizNo: '1', name: '첫 업체' }, { bizNo: '2', name: '둘 업체' }, { bizNo: '3', name: '셋 업체' }, { bizNo: '4', name: '넷 업체' },
    ])
    await handle.db.insert(bidders).values([
      { bidNtceNo: 'A', awardOrd: '000', openingDate: '2026-08-15', bizNo: '1', rank: 1, amount: 100, rate: 88.1, won: true },
      { bidNtceNo: 'A', awardOrd: '000', openingDate: '2026-08-15', bizNo: '2', rank: 2, amount: 101, rate: 90.2, won: false },
      { bidNtceNo: 'A', awardOrd: '000', openingDate: '2026-08-15', bizNo: '3', rank: 3, amount: 102, rate: 92.3, won: false },
      { bidNtceNo: 'A', awardOrd: '000', openingDate: '2026-08-15', bizNo: '4', rank: 0, amount: 103, rate: 95.4, won: false },
    ])
    await buildBidderSummaries(handle.db, { from: '2026-08-15', to: '2026-08-15' })
    const first = (await handle.db.select().from(awards))[0]?.bidderSummary
    await buildBidderSummaries(handle.db, { from: '2026-08-15', to: '2026-08-15' })
    const second = (await handle.db.select().from(awards))[0]?.bidderSummary
    expect(second).toEqual(first)
    expect(second).toMatchObject({ n: 4, medianRate: 91.25, minRate: 88.1, maxRate: 95.4 })
    expect(second?.top).toHaveLength(3)
    expect(second?.top.map((top) => top.rank)).toEqual([1, 2, 3])
    expect(second?.top[0]?.won).toBe(true)
  })

  it('투찰이 없는 낙찰에는 빈 요약을 채운다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values({ bidNtceNo: 'EMPTY', ord: '000', openingDate: '2026-08-15' })
    await buildBidderSummaries(handle.db, { from: '2026-08-15', to: '2026-08-15' })
    expect((await handle.db.select().from(awards))[0]?.bidderSummary).toEqual(EMPTY_BIDDER_SUMMARY)
  })

  it('onlyMissing은 이미 있는 요약을 덮어쓰지 않는다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values({ bidNtceNo: 'MISSING', ord: '000', openingDate: '2026-08-15' })
    await handle.db.insert(bidders).values({ bidNtceNo: 'MISSING', awardOrd: '000', openingDate: '2026-08-15', bizNo: '1', rank: 1, rate: 88 })
    await buildBidderSummaries(handle.db, { from: '2026-08-15', to: '2026-08-15' })
    await handle.db.insert(bidders).values({ bidNtceNo: 'MISSING', awardOrd: '000', openingDate: '2026-08-15', bizNo: '2', rank: 2, rate: 92 })
    await buildBidderSummaries(handle.db, { from: '2026-08-15', to: '2026-08-15', onlyMissing: true })
    expect((await handle.db.select().from(awards))[0]?.bidderSummary?.n).toBe(1)
  })

  it('요약 생성은 awards.updated_at을 바꾸지 않는다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values({ bidNtceNo: 'TIME', ord: '000', openingDate: '2026-08-15' })
    await handle.db.insert(bidders).values({ bidNtceNo: 'TIME', awardOrd: '000', openingDate: '2026-08-15', bizNo: '1', rank: 1, rate: 90 })
    const before = (await handle.db.select().from(awards))[0]?.updatedAt
    await buildBidderSummaries(handle.db, { from: '2026-08-15', to: '2026-08-15' })
    const after = (await handle.db.select().from(awards))[0]?.updatedAt
    expect(after).toEqual(before)
  })

  it('메모리 누적기와 SQL 생성기가 같은 요약을 만든다', async () => {
    handle = await createTestDb()
    const rows: AwardRow[] = [
      { bidNtceNo: 'SAME', bidNtceOrd: '000', bidNtceNm: '같은 공고', opengDate: '20260815', opengRank: '1', bidprcCorpBizrno: '1', bidprcCorpNm: '첫 업체', bidprcAmt: '100', bidprcRt: '88.1', sucsfYn: 'Y' },
      { bidNtceNo: 'SAME', bidNtceOrd: '000', bidNtceNm: '같은 공고', opengDate: '20260815', opengRank: '2', bidprcCorpBizrno: '2', bidprcCorpNm: '둘 업체', bidprcAmt: '101', bidprcRt: '90.2', sucsfYn: 'N' },
      { bidNtceNo: 'SAME', bidNtceOrd: '000', bidNtceNm: '같은 공고', opengDate: '20260815', opengRank: '3', bidprcCorpBizrno: '3', bidprcCorpNm: '셋 업체', bidprcAmt: '102', bidprcRt: '92.3', sucsfYn: 'N' },
      { bidNtceNo: 'SAME', bidNtceOrd: '000', bidNtceNm: '같은 공고', opengDate: '20260815', opengRank: '0', bidprcCorpBizrno: '4', bidprcCorpNm: '넷 업체', bidprcAmt: '103', bidprcRt: '95.4', sucsfYn: 'N' },
    ]
    await upsertAwardPage(handle.db, rows, 'Servc')
    await buildBidderSummaries(handle.db, { from: '2026-08-15', to: '2026-08-15' })
    const sqlSummary = (await handle.db.select().from(awards))[0]?.bidderSummary
    const acc = newAwardAccumulator(); addAwardRows(acc, rows)
    expect(summaryOf([...acc.values()][0]!)).toEqual(sqlSummary)
  })
})
