import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { awards, companies, ensurePartitions } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { companyHref, hyphenBizNo, isBizNoParam, plainBizNo } from '@/lib/biz-no'
import { loadCompanyProfile } from '@/server/companies'
import { makeDb } from './helpers'

const range = { from: '2026-06-01', to: '2026-08-31' }

describe('업체 프로파일', () => {
  let handle: DbHandle

  beforeEach(async () => {
    handle = await makeDb()
    await ensurePartitions(handle.db, ['2026-06-15', '2026-09-15'])
    await handle.db.insert(companies).values([
      { bizNo: '314-81-00001', name: '나래기술', ceo: '김나래', address: '대전광역시', tel: '042-000-0001' },
      { bizNo: '3148100001', name: '나래기술' },
      { bizNo: '2228100002', name: '하늘측량' },
      { bizNo: '7778100004', name: '무실적상사' },
    ])
    await handle.db.insert(awards).values([
      {
        bidNtceNo: 'AW-CP-06', ord: '000', openingDate: '2026-06-10', title: '대전 시설 사업', bizDiv: '용역',
        ntceInsttNm: '대전테크노파크', finalAmount: 1_000_000, finalRate: 88, winnerBizNo: '314-81-00001', winnerName: '나래기술',
      },
      {
        bidNtceNo: 'AW-CP-08A', ord: '000', openingDate: '2026-08-05', title: '대전 지적 측량', bizDiv: '용역',
        ntceInsttNm: '대전테크노파크', finalAmount: 2_000_000, finalRate: 90, winnerBizNo: '314-81-00001', winnerName: '나래기술',
      },
      {
        bidNtceNo: 'AW-CP-08B', ord: '000', openingDate: '2026-08-20', title: '세종 시설 관제', bizDiv: '용역',
        ntceInsttNm: '세종시청', finalAmount: 3_000_000, finalRate: 92, winnerBizNo: '314-81-00001', winnerName: '나래기술',
        bidderSummary: {
          n: 5, medianRate: 90, minRate: 88, maxRate: 95,
          top: [
            { rank: 1, bizNo: '3148100001', name: '나래기술', amount: 3_000_000, rate: 92, won: true },
            { rank: 2, bizNo: '2228100002', name: '하늘측량', amount: 3_100_000, rate: 93, won: false },
            { rank: 3, bizNo: '9998100003', name: '가온기술', amount: 3_200_000, rate: 94, won: false },
          ],
        },
      },
      {
        bidNtceNo: 'AW-CP-08C', ord: '000', openingDate: '2026-08-06', title: '세종 측량 용역', bizDiv: '용역',
        ntceInsttNm: '세종시청', finalAmount: 1_500_000, finalRate: 89, winnerBizNo: '222-81-00002', winnerName: '하늘측량',
        bidderSummary: {
          n: 4, medianRate: 90, minRate: 87, maxRate: 94,
          top: [
            { rank: 1, bizNo: '2228100002', name: '하늘측량', amount: 1_500_000, rate: 90, won: true },
            { rank: 2, bizNo: '3148100001', name: '나래기술', amount: 1_550_000, rate: 91, won: false },
          ],
        },
      },
      {
        bidNtceNo: 'AW-CP-09', ord: '000', openingDate: '2026-09-01', title: '범위 밖 낙찰', bizDiv: '용역',
        ntceInsttNm: '범위밖기관', finalAmount: 9_000_000, finalRate: 99, winnerBizNo: '314-81-00001', winnerName: '나래기술',
      },
    ])
  })

  afterEach(async () => {
    await handle.close()
  })

  it('월별 추이를 낙찰 건수·금액·낙찰 시 투찰율로 집계하고 중간 빈 달을 0으로 채운다', async () => {
    const profile = await loadCompanyProfile(handle.db, '3148100001', range)
    expect(profile).not.toBeNull()
    expect(profile!.months.map((month) => month.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(profile!.months[1]).toMatchObject({ won: 0, amount: 0, avgWinRate: null })
    expect(profile!.months[2]).toMatchObject({ won: 2, amount: 5_000_000, avgWinRate: 91 })
  })

  it('하이픈 표기와 숫자만 표기 어느 쪽으로 조회해도 같은 결과를 낸다', async () => {
    const hyphen = await loadCompanyProfile(handle.db, '314-81-00001', range)
    const plain = await loadCompanyProfile(handle.db, '3148100001', range)
    expect(hyphen).not.toBeNull()
    expect(plain).not.toBeNull()
    expect(hyphen!.totals).toEqual(plain!.totals)
  })

  it('합계를 낙찰 건수·금액·낙찰 시 투찰율·발주기관 수로 낸다', async () => {
    const profile = await loadCompanyProfile(handle.db, '314-81-00001', range)
    expect(profile!.totals).toMatchObject({
      won: 3, amount: 6_000_000, avgWinRate: 90, agencies: 2,
      firstAwardDate: '2026-06-10', lastAwardDate: '2026-08-20',
    })
  })

  it('주요 발주기관을 건수 내림차순으로 낸다', async () => {
    const profile = await loadCompanyProfile(handle.db, '3148100001', range)
    expect(profile!.agencies[0]).toEqual({ agency: '대전테크노파크', won: 2, amount: 3_000_000 })
    expect(profile!.agencies).toHaveLength(2)
    expect(profile!.agencies.length).toBeLessThanOrEqual(10)
  })

  it('최근 낙찰을 개찰일 내림차순으로 낸다', async () => {
    const profile = await loadCompanyProfile(handle.db, '3148100001', range)
    expect(profile!.recent[0]).toMatchObject({ openingDate: '2026-08-20', amount: 3_000_000, rate: 92 })
    expect(profile!.recent[0].id).toMatch(/^award-.+-000$/)
    expect(profile!.recent).toHaveLength(3)
  })

  it('bidder_summary 상위 3위에서 동반 노출 업체와 노출 지표를 만든다', async () => {
    const profile = await loadCompanyProfile(handle.db, '3148100001', range)
    expect(profile!.exposure).toMatchObject({ appearances: 2, won: 1, avgRate: 91.5 })
    expect(profile!.peers).toContainEqual({ bizNo: '2228100002', name: '하늘측량', together: 2 })
    expect(profile!.peers.some((peer) => peer.bizNo === '3148100001')).toBe(false)
  })

  it('집계 구간 밖의 낙찰은 제외한다', async () => {
    const profile = await loadCompanyProfile(handle.db, '3148100001', range)
    expect(profile!.totals.won).toBe(3)
    expect(profile!.recent).toHaveLength(3)
    expect(profile!.months.some((month) => month.month === '2026-09')).toBe(false)
  })

  it('낙찰도 업체 정보도 없는 사업자번호는 null을, companies에만 있으면 빈 집계를 돌려준다', async () => {
    const noData = await loadCompanyProfile(handle.db, '9999999999', range)
    expect(noData).toBeNull()

    const empty = await loadCompanyProfile(handle.db, '7778100004', range)
    expect(empty).not.toBeNull()
    expect(empty).toMatchObject({ name: '무실적상사', totals: { won: 0 } })
    expect(empty!.months).toEqual([])
    expect(empty!.agencies).toEqual([])
    expect(empty!.recent).toEqual([])
    expect(empty!.peers).toEqual([])
    expect(empty!.exposure.appearances).toBe(0)
  })
})

describe('사업자번호 표기', () => {
  it('isBizNoParam·companyHref가 10자리 사업자번호만 통과시킨다', () => {
    expect(isBizNoParam('412-10-98706')).toBe(true)
    expect(isBizNoParam('4121098706')).toBe(true)
    expect(isBizNoParam('--')).toBe(false)
    expect(isBizNoParam('나래기술')).toBe(false)
    expect(isBizNoParam('12345')).toBe(false)
    expect(companyHref('412-10-98706')).toBe('/companies/4121098706')
    expect(companyHref('--')).toBeNull()
    expect(hyphenBizNo('4121098706')).toBe('412-10-98706')
    expect(plainBizNo('412-10-98706')).toBe('4121098706')
  })
})
