import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from '@nara/db/testing'
import { awards, bidders, contracts, ensurePartitions, notices } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { prune, PruneSafetyError } from '../prune'

describe('보존 정책 정리', () => {
  let handle: DbHandle | undefined
  afterEach(async () => { await handle?.close(); handle = undefined })

  it('보존 창 밖 투찰행을 요약 생성 후 삭제한다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-10'])
    await handle.db.insert(awards).values({ bidNtceNo: 'OLD', ord: '000', openingDate: '2026-08-10' })
    await handle.db.insert(bidders).values({ bidNtceNo: 'OLD', awardOrd: '000', openingDate: '2026-08-10', bizNo: '1', rank: 1, rate: 90 })
    const result = await prune({ db: handle.db, today: '2026-08-31' })
    expect(result.summaries.updated).toBe(1)
    expect(await handle.db.select().from(bidders)).toHaveLength(0)
    const [award] = await handle.db.select().from(awards)
    expect(award?.bidderSummary).toMatchObject({ n: 1, medianRate: 90 })
  })

  it('요약을 만들 수 없는 낙찰이 있으면 아무것도 지우지 않는다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-10'])
    await handle.db.insert(bidders).values({ bidNtceNo: 'UNSAFE', awardOrd: '000', openingDate: '2026-08-10', bizNo: '1', rank: 1 })
    await handle.db.insert(notices).values({ bidNtceNo: 'OLD-NOTICE', ord: '000', noticeDate: '2026-01-01' })
    await handle.db.insert(contracts).values({ cntrctNo: 'OLD-CONTRACT', ord: '00', concludeDate: '2026-01-01' })
    await expect(prune({ db: handle.db, today: '2026-08-31', countMissing: async () => 3 })).rejects.toBeInstanceOf(PruneSafetyError)
    expect(await handle.db.select().from(bidders)).toHaveLength(1)
    expect(await handle.db.select().from(notices)).toHaveLength(1)
    expect(await handle.db.select().from(contracts)).toHaveLength(1)
  })

  it('월 전체가 창 밖인 파티션은 DROP TABLE로 회수한다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-06-15', '2026-07-15', '2026-08-15'])
    await handle.db.insert(bidders).values([
      { bidNtceNo: 'JUNE', awardOrd: '000', openingDate: '2026-06-15', bizNo: '1', rank: 1 },
      { bidNtceNo: 'JULY', awardOrd: '000', openingDate: '2026-07-15', bizNo: '2', rank: 1 },
      { bidNtceNo: 'AUGUST', awardOrd: '000', openingDate: '2026-08-15', bizNo: '3', rank: 1 },
    ])
    const result = await prune({ db: handle.db, today: '2026-08-31' })
    expect(result.bidders.droppedPartitions).toEqual(['bidders_2026_06', 'bidders_2026_07'])
    expect(await handle.db.select().from(bidders)).toHaveLength(0)
    const partitions = await handle.db.execute(sql`select relname from pg_class where relname = 'bidders_2026_08'`)
    expect((partitions as unknown as { rows: unknown[] }).rows).toHaveLength(1)
  })

  it('--dry-run은 아무것도 지우지 않고 예정 건수만 센다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-06-15', '2026-08-10'])
    await handle.db.insert(bidders).values([
      { bidNtceNo: 'DRY-JUNE', awardOrd: '000', openingDate: '2026-06-15', bizNo: '1', rank: 1 },
      { bidNtceNo: 'DRY-AUGUST', awardOrd: '000', openingDate: '2026-08-10', bizNo: '2', rank: 1 },
    ])
    const result = await prune({ db: handle.db, today: '2026-08-31', dryRun: true })
    expect(result.bidders.deleted).toBe(2)
    expect(result.bidders.droppedPartitions).toEqual(['bidders_2026_06'])
    expect(await handle.db.select().from(bidders)).toHaveLength(2)
  })

  it('공고·계약은 날짜 기준으로만 지우고 날짜 없는 행은 남긴다', async () => {
    handle = await createTestDb()
    await handle.db.insert(notices).values([
      { bidNtceNo: 'OLD-N', ord: '000', noticeDate: '2026-01-01' },
      { bidNtceNo: 'NULL-N', ord: '000', noticeDate: null },
    ])
    await handle.db.insert(contracts).values([
      { cntrctNo: 'OLD-C', ord: '00', concludeDate: '2026-01-01' },
      { cntrctNo: 'NULL-C', ord: '00', concludeDate: null },
    ])
    await prune({ db: handle.db, today: '2026-08-31' })
    expect((await handle.db.select().from(notices)).map((row) => row.bidNtceNo)).toEqual(['NULL-N'])
    expect((await handle.db.select().from(contracts)).map((row) => row.cntrctNo)).toEqual(['NULL-C'])
  })
})
