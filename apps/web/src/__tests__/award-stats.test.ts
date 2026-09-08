import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agencies, awards } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { rebuildAwardStats } from 'worker'
import { loadAwardStats, loadAwardStatsMany } from '@/server/award-stats'
import { setAuthUserForTesting } from '@/server/auth'
import { setDbForTesting } from '@/server/db'
import { GET as getAwardStats } from '@/app/api/award-stats/route'
import { makeDb, TEST_USER } from './helpers'

describe('낙찰 통계 조회', () => {
  let handle: DbHandle

  beforeEach(async () => {
    handle = await makeDb()
    setDbForTesting(handle.db)
    setAuthUserForTesting(TEST_USER)
  })

  afterEach(async () => {
    setDbForTesting(undefined)
    setAuthUserForTesting(undefined)
    await handle.close()
  })

  type AwardInsert = typeof awards.$inferInsert
  const makeAward = (id: string, index: number, overrides: Partial<AwardInsert> = {}): AwardInsert => ({
    bidNtceNo: id,
    ord: '000',
    openingDate: '2026-08-15',
    bizDivKey: 'Servc',
    ntceInsttCd: 'AGENCY-1',
    awardMethod: '소액수의견적',
    estimatedPrice: 50_000_000,
    finalRate: 80 + index,
    lowerLimitRate: 75,
    ...overrides,
  })

  const insertGroup = async (prefix: string, count: number, overrides: Partial<AwardInsert> = {}): Promise<void> => {
    await handle.db.insert(awards).values(Array.from({ length: count }, (_, index) => makeAward(`${prefix}-${index}`, index, overrides)))
  }

  const rebuild = async (): Promise<void> => {
    await rebuildAwardStats({ db: handle.db, month: '2026-08' })
  }

  it('n이 충분한 최상위 셀(level 4)을 그대로 쓰고 basis에 셀 정의를 담는다', async () => {
    await handle.db.insert(agencies).values({ code: 'AGENCY-1', name: '테스트기관' })
    await insertGroup('TOP', 30)
    await rebuild()

    const result = await loadAwardStats(handle.db, { agencyCode: 'AGENCY-1', bizDivKey: 'Servc', amount: 50_000_000, awardMethod: '소액수의견적' })
    expect(result).not.toBeNull()
    expect(result?.basis).toMatchObject({
      level: 4, agencyCode: 'AGENCY-1', agencyName: '테스트기관', bizDivKey: 'Servc', amountBucket: 7,
      awardMethod: '소액수의견적', n: 30, sufficient: true, fallbackFrom: [],
      window: { from: '2025-09-01', to: '2026-08-31' },
    })
    expect(result?.basis.label).toContain('테스트기관 · 용역 · 10,000,000원~100,000,000원 · 소액수의견적')
  })

  it('level 4가 30 미만이면 기관을 생략한 level 3으로 폴백한다', async () => {
    await insertGroup('TARGET', 10, { ntceInsttCd: 'AGENCY-TARGET' })
    await insertGroup('OTHER', 25, { ntceInsttCd: 'AGENCY-OTHER' })
    await rebuild()

    const result = await loadAwardStats(handle.db, { agencyCode: 'AGENCY-TARGET', bizDivKey: 'Servc', amount: 50_000_000, awardMethod: '소액수의견적' })
    expect(result?.basis).toMatchObject({ level: 3, agencyCode: null, agencyName: null, n: 35, sufficient: true, fallbackFrom: [4] })
    expect(result?.basis.amountBucket).toBe(7)
  })

  it('금액 버킷까지 30 미만이면 level 2 → level 1 → level 0 순으로 내려간다', async () => {
    await insertGroup('SERVC-MATCH', 10, { ntceInsttCd: 'AGENCY-TARGET' })
    await insertGroup('SERVC-OTHER', 10, { ntceInsttCd: 'AGENCY-OTHER', awardMethod: '적격심사제' })
    await insertGroup('THNG', 20, { bizDivKey: 'Thng', ntceInsttCd: 'AGENCY-THNG', awardMethod: '적격심사제' })
    await rebuild()

    const result = await loadAwardStats(handle.db, { agencyCode: 'AGENCY-TARGET', bizDivKey: 'Servc', amount: 50_000_000, awardMethod: '소액수의견적' })
    expect(result?.basis).toMatchObject({ level: 0, label: '전체', n: 40, sufficient: true, fallbackFrom: [4, 3, 2, 1] })
    expect(result?.basis.agencyCode).toBeNull()
    expect(result?.basis.bizDivKey).toBeNull()
    expect(result?.basis.amountBucket).toBeNull()
    expect(result?.basis.awardMethod).toBeNull()
  })

  it('입력에 금액이 없으면 금액 버킷 단계(level 4·3)를 건너뛴다', async () => {
    await insertGroup('TARGET', 10, { ntceInsttCd: 'AGENCY-TARGET' })
    await insertGroup('OTHER', 25, { ntceInsttCd: 'AGENCY-OTHER' })
    await rebuild()

    const result = await loadAwardStats(handle.db, { agencyCode: 'AGENCY-TARGET', bizDivKey: 'Servc', awardMethod: '소액수의견적' })
    expect(result?.basis).toMatchObject({ level: 2, n: 35, sufficient: true, fallbackFrom: [], amountBucket: null, amountRange: null })
  })

  it('전체 셀도 30 미만이면 그대로 쓰고 sufficient를 false로 표시한다', async () => {
    await insertGroup('SMALL', 1)
    await rebuild()

    const result = await loadAwardStats(handle.db, {})
    expect(result?.basis).toMatchObject({ level: 0, n: 1, sufficient: false, fallbackFrom: [], label: '전체' })
  })

  it('recommended는 rate p25~p75다', async () => {
    await handle.db.insert(awards).values([
      makeAward('RECOMMENDED-0', 0, { finalRate: 80 }),
      makeAward('RECOMMENDED-1', 1, { finalRate: 90 }),
      makeAward('RECOMMENDED-2', 2, { finalRate: 100 }),
      makeAward('RECOMMENDED-3', 3, { finalRate: 110 }),
    ])
    await rebuild()

    const result = await loadAwardStats(handle.db, { agencyCode: 'AGENCY-1', bizDivKey: 'Servc', amount: 50_000_000, awardMethod: '소액수의견적' })
    expect(result?.recommended).toEqual({ from: result?.rate.p25, to: result?.rate.p75 })
    expect(result?.recommended).not.toBeNull()
  })

  it('award_stats가 비어 있으면 null을 반환한다', async () => {
    expect(await loadAwardStats(handle.db, { bizDivKey: 'Servc', awardMethod: '소액수의견적' })).toBeNull()
  })

  it('loadAwardStatsMany는 조건 순서대로 결과를 돌려주고 각 결과가 loadAwardStats와 같다', async () => {
    await insertGroup('BATCH-TOP', 30, { ntceInsttCd: 'AGENCY-TOP' })
    await insertGroup('BATCH-FALLBACK', 10, { ntceInsttCd: 'AGENCY-FALLBACK' })
    await insertGroup('BATCH-OTHER', 25, { ntceInsttCd: 'AGENCY-OTHER' })
    await rebuild()

    const queries = [
      { agencyCode: 'AGENCY-TOP', bizDivKey: 'Servc', amount: 50_000_000, awardMethod: '소액수의견적' },
      { agencyCode: 'AGENCY-FALLBACK', bizDivKey: 'Servc', amount: 50_000_000, awardMethod: '소액수의견적' },
      { agencyCode: 'AGENCY-MISSING', bizDivKey: 'Cnstwk', amount: 50_000_000, awardMethod: '없는방법' },
    ]
    const batch = await loadAwardStatsMany(handle.db, queries)
    const singles = await Promise.all(queries.map((query) => loadAwardStats(handle.db, query)))

    expect(batch).toEqual(singles)
    expect(batch[0]?.basis.level).toBe(4)
    expect(batch[1]?.basis.level).toBe(3)
    expect(batch[2]?.basis.level).toBe(0)
  })

  it('loadAwardStatsMany는 빈 입력에 빈 배열을 돌려준다', async () => {
    expect(await loadAwardStatsMany(handle.db, [])).toEqual([])
  })

  it('/api/award-stats는 미로그인이면 401을 반환한다', async () => {
    setAuthUserForTesting(null)
    const response = await getAwardStats(new Request('http://localhost/api/award-stats?bizDivKey=Servc'))
    expect(response.status).toBe(401)
  })

  it('/api/award-stats는 amount가 숫자가 아니면 400을 반환한다', async () => {
    const response = await getAwardStats(new Request('http://localhost/api/award-stats?amount=not-a-number'))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toEqual(expect.any(String))
  })
})
