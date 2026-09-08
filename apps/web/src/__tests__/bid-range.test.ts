import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { awards } from '@nara/db'
import type { DbHandle } from '@nara/db'
import type { Item } from '@nara/api'
import type { AwardStatsBasis, AwardStatsResult } from '@/lib/api-types'
import { rebuildAwardStats } from 'worker'
import { GET } from '@/app/api/search/route'
import { setAuthUserForTesting } from '@/server/auth'
import { setDbForTesting } from '@/server/db'
import { makeDb, seedAll, TEST_USER } from './helpers'
import {
  BID_RANGE_DISCLAIMER,
  awardMethodKeyOf,
  awardStatsCellOf,
  basisTextOf,
  bidRangeOf,
  bizDivKeyOf,
  estimatedPriceOf,
} from '@/lib/bid-range'

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: 'award-TEST-000', kind: 'award', noticeNo: 'TEST', title: '테스트', agency: '기관', date: '2026-08-15',
  award: { ord: '000', bidders: [] },
  ...overrides,
})

const makeBasis = (overrides: Partial<AwardStatsBasis> = {}): AwardStatsBasis => ({
  level: 3, label: '용역 · 10,000,000원~100,000,000원 · 소액수의견적', agencyCode: null, agencyName: null,
  bizDivKey: 'Servc', amountBucket: 7, amountRange: { from: 10_000_000, to: 100_000_000 }, awardMethod: '소액수의견적',
  n: 30, sufficient: true, fallbackFrom: [], window: { from: '2025-09-01', to: '2026-08-31' }, computedAt: '2026-08-31T00:00:00.000Z',
  ...overrides,
})

const makeStats = (overrides: Partial<AwardStatsResult> = {}): AwardStatsResult => ({
  rate: { p10: 80, p25: 88.05, p50: 88.2, p75: 88.84, p90: 90, avg: 88.3 },
  margin: { n: 30, p10: 0, p25: 1, p50: 2, p75: 3, p90: 4, avg: 2 },
  lowerLimitP50: 88, recommended: { from: 88.05, to: 88.84 }, basis: makeBasis(),
  ...overrides,
})

describe('추천 투찰 구간 셀 매핑', () => {
  it('낙찰 항목을 기관코드·업무구분·추정가격·낙찰방법 셀로 매핑한다', () => {
    const item = makeItem({ award: { ord: '000', agencyCode: 'DTP', bizDiv: '용역', estimatedPrice: 1_200_000, awardMethod: '소액수의견적', bidders: [] } })
    expect(awardStatsCellOf(item)).toEqual({ agencyCode: 'DTP', bizDivKey: 'Servc', amount: 1_200_000, awardMethod: '소액수의견적' })
  })

  it('공고의 복합 낙찰자결정방법을 첫 마디로 정규화한다', () => {
    expect(awardMethodKeyOf('소액수의견적-소액수의견적(2인 이상 견적 제출)-국민연금보험료 등 합산액 감액 적용')).toBe('소액수의견적')
    expect(awardMethodKeyOf('수의시담')).toBe('수의시담')
  })

  it('업무구분 라벨을 키로 되돌리고 모르는 라벨은 null이다', () => {
    expect(bizDivKeyOf('물품')).toBe('Thng')
    expect(bizDivKeyOf('외자')).toBe('Frgcpt')
    expect(bizDivKeyOf('공사')).toBe('Cnstwk')
    expect(bizDivKeyOf('용역')).toBe('Servc')
    expect(bizDivKeyOf('기타')).toBeNull()
  })

  it('계약·사전규격 항목에는 셀이 없다', () => {
    expect(awardStatsCellOf(makeItem({ kind: 'contract', contract: { contractNo: 'CT' }, award: undefined }))).toBeNull()
    expect(awardStatsCellOf(makeItem({ kind: 'prespec', prespec: { specDocs: [], products: [], relatedNoticeNos: [] }, award: undefined }))).toBeNull()
  })

  it('공고에 추정가격이 없으면 배정예산을 쓴다', () => {
    const item = makeItem({ kind: 'notice', award: undefined, notice: { ord: '000', agencyCode: 'DTP', bizDiv: '용역', budget: 2_000_000, awardMethod: '협상에 의한 계약' } })
    expect(estimatedPriceOf(item)).toBe(2_000_000)
    expect(awardStatsCellOf(item)?.amount).toBe(2_000_000)
  })
})

describe('추천 투찰 구간 표시 값', () => {
  it('recommended p25~p75와 추정가격 환산 금액을 만든다', () => {
    const range = bidRangeOf(makeStats(), { estimatedPrice: 1_200_000 })
    expect(range).toMatchObject({ from: 88.05, to: 88.84, amount: { from: 1_056_600, to: 1_066_080 } })
  })

  it('표본이 부족하면(sufficient=false) null을 반환한다', () => {
    expect(bidRangeOf(makeStats({ basis: makeBasis({ sufficient: false }) }))).toBeNull()
  })

  it('업무구분이 없는 전체 셀(level 0)은 표시하지 않는다', () => {
    expect(bidRangeOf(makeStats({ basis: makeBasis({ level: 0, label: '전체', bizDivKey: null, amountBucket: null, amountRange: null, awardMethod: null }) }))).toBeNull()
  })

  it('recommended가 null이면 null을 반환한다', () => {
    expect(bidRangeOf(makeStats({ recommended: null }))).toBeNull()
  })

  it('미니 바 좌표를 p10~p90 트랙 기준으로 계산하고 실제 투찰율을 0~100으로 클램프한다', () => {
    const range = bidRangeOf(makeStats({ rate: { p10: 80, p25: 85, p50: 90, p75: 95, p90: 100, avg: 90 }, recommended: { from: 85, to: 95 } }), { actualRate: 200 })
    expect(range?.track).toEqual({ from: 80, to: 100 })
    expect(range?.bar).toEqual({ start: 25, end: 75, mid: 50, actual: 100 })
  })

  it('근거 문구에 셀 이름·표본 수·집계 창을 담고 폴백이면 대체 문구를 붙인다', () => {
    const text = basisTextOf(makeBasis({ fallbackFrom: [4] }))
    expect(text).toBe('용역 · 10,000,000원~100,000,000원 · 소액수의견적 · 표본 30건 · 2025-09-01~2026-08-31 · 표본 부족으로 상위 기준 대체')
    expect(BID_RANGE_DISCLAIMER).toContain('예측이 아니며')
  })
})

const ok = (body: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body } }) })
const request = (query: string) => new Request(`http://localhost/api/search?${query}`)

describe('검색 응답 추천 구간', () => {
  let handle: DbHandle
  let previousKey: string | undefined
  let previousViteKey: string | undefined

  beforeEach(async () => {
    handle = await makeDb()
    await seedAll(handle.db)
    setDbForTesting(handle.db)
    setAuthUserForTesting(TEST_USER)
    previousKey = process.env.NARA_API_KEY
    previousViteKey = process.env.VITE_NARA_API_KEY
    process.env.NARA_API_KEY = 'test-key'
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    setDbForTesting(undefined)
    setAuthUserForTesting(undefined)
    if (previousKey === undefined) delete process.env.NARA_API_KEY
    else process.env.NARA_API_KEY = previousKey
    if (previousViteKey === undefined) delete process.env.VITE_NARA_API_KEY
    else process.env.VITE_NARA_API_KEY = previousViteKey
    await handle.close()
  })

  type AwardInsert = typeof awards.$inferInsert
  const insertHistory = async (prefix: string, count: number, awardMethod = '소액수의견적'): Promise<void> => {
    const values: AwardInsert[] = Array.from({ length: count }, (_, index) => ({
      bidNtceNo: `${prefix}-${index}`, ord: '000', openingDate: '2026-08-15', title: `시설 이력 ${index}`, bizDiv: '용역', bizDivKey: 'Servc',
      ntceInsttCd: 'DTP', ntceInsttNm: '대전테크노파크', awardMethod, estimatedPrice: 1_200_000, finalRate: 80 + index * 0.5, lowerLimitRate: 87.745,
    }))
    await handle.db.insert(awards).values(values)
  }

  const rebuild = async (): Promise<void> => {
    await rebuildAwardStats({ db: handle.db, month: '2026-08' })
  }

  it('낙찰 검색 결과에 표본 30건 이상 셀을 중복 없이 붙인다', async () => {
    await insertHistory('AW-BR', 30)
    await rebuild()
    const response = await GET(request('kind=award&from=2026-08-01&to=2026-08-31'))
    const body = await response.json()
    const index = body.awardStats?.byItem['award-AW-BR-0-000']
    expect(response.status).toBe(200)
    expect(index).toBeDefined()
    expect(body.awardStats.cells[index].basis.level).toBe(4)
    expect(body.awardStats.cells[index].basis.n).toBe(30)
    expect(body.awardStats.cells.length).toBeLessThanOrEqual(3)
  })

  it('공고 검색 결과에 같은 셀 기준 구간을 붙인다', async () => {
    await insertHistory('AW-NOTICE', 30, '협상에 의한 계약')
    await rebuild()
    const response = await GET(request('kind=notice&from=2026-08-01&to=2026-08-31'))
    const body = await response.json()
    const index = body.awardStats?.byItem['notice-NT-001-000']
    expect(response.status).toBe(200)
    expect(index).toBeDefined()
    expect(body.awardStats.cells[index].basis.awardMethod).toBe('협상에 의한 계약')
    expect(body.awardStats.cells[index].basis.amountBucket).toBe(6)
  })

  it('표본이 30건 미만이면 awardStats를 붙이지 않는다', async () => {
    await insertHistory('AW-SMALL', 5)
    await rebuild()
    const response = await GET(request('kind=award&from=2026-08-01&to=2026-08-31'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.awardStats).toBeUndefined()
  })

  it('계약 검색 결과에는 awardStats가 없다', async () => {
    const response = await GET(request('kind=contract&from=2026-08-01&to=2026-08-31'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.awardStats).toBeUndefined()
  })

  it('실시간 공고 조회 결과에도 구간을 붙인다', async () => {
    await insertHistory('AW-LIVE', 30)
    await rebuild()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const operation = new URL(url).pathname.split('/').pop() ?? ''
      return ok({
        items: [{
          bidNtceNo: `LIVE-BR-${operation}`, bidNtceOrd: '000', bidNtceNm: '시설 실시간 공고', bidNtceDt: '2026-08-01 10:00:00',
          ntceInsttCd: 'DTP', ntceInsttNm: '대전테크노파크', bsnsDivNm: '용역',
          sucsfbidMthdNm: '소액수의견적-소액수의견적(2인 이상 견적 제출)', presmptPrce: '1200000', asignBdgtAmt: '1500000',
        }], totalCount: 1, pageNo: 1, numOfRows: 999,
      })
    }))
    const response = await GET(request('kind=notice&source=live&keyword=%EC%8B%9C%EC%84%A4&from=2026-08-01&to=2026-08-28'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.source).toBe('live')
    expect(body.awardStats?.byItem[body.items[0].id]).toBeDefined()
  })
})
