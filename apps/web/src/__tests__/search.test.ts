import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensurePartitions, awards, prespecs } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { setAuthUserForTesting } from '@/server/auth'
import { setDbForTesting } from '@/server/db'
import { GET } from '@/app/api/search/route'
import { makeDb, seedAll, TEST_USER } from './helpers'

const request = (query: string) => new Request(`http://localhost/api/search?${query}`)

describe('/api/search', () => {
  let handle: DbHandle

  beforeEach(async () => {
    handle = await makeDb()
    await seedAll(handle.db)
    setDbForTesting(handle.db)
    setAuthUserForTesting(TEST_USER)
  })

  afterEach(async () => {
    setDbForTesting(undefined)
    setAuthUserForTesting(undefined)
    await handle.close()
  })

  it('낙찰 검색 결과에 업체 조인을 순위순으로 포함한다', async () => {
    const response = await GET(request('kind=award&from=2026-08-01&to=2026-08-31&keyword=%EC%8B%9C%EC%84%A4'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].award.bidders).toHaveLength(2)
    expect(body.items[0].award.bidders.map((bidder: { rank: number }) => bidder.rank)).toEqual([1, 2])
    expect(body.items[0].award.bidders[0].name).toBe('나래기술')
  })

  it('공고 검색에서 발주기관을 필터링한다', async () => {
    const response = await GET(request('kind=notice&from=2026-08-01&to=2026-08-31&agency=%EB%8C%80%EC%A0%84%ED%85%8C%ED%81%AC%EB%85%B8%ED%8C%8C%ED%81%AC'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].agency).toBe('대전테크노파크')
  })

  it('DB 공고 결과에 첨부와 상세 링크를 포함한다', async () => {
    const response = await GET(request('kind=notice&from=2026-08-01&to=2026-08-31&keyword=%EC%8B%9C%EC%84%A4'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.items[0].notice.attachments).toEqual([{ url: 'https://example.com/files/NT-001-spec.hwp', name: '과업지시서.hwp' }])
    expect(body.items[0].notice.detailUrl).toBe('https://example.com/notices/NT-001/detail')
    expect(body.items[0].url).toBe('https://example.com/notices/NT-001/detail')
    expect(body.items[0].notice.lowerLimitRate).toBe(87.745)
  })

  it('공고 결과에 사전규격 번호와 전환 시각을 담는다', async () => {
    const response = await GET(request('kind=notice&from=2026-08-01&to=2026-08-31&keyword=NT-001'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.items[0].notice.prespecNo).toBe('PS-001')
    expect(body.items[0].notice.prespecLinkedAt).toBe('2026-08-16T00:00:00.000Z')
  })

  it('사전규격 상세 조인 결과를 채운다', async () => {
    const response = await GET(request('kind=prespec&from=2026-08-01&to=2026-08-31'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.items[0].prespec.specDocs).toEqual(['https://example.com/specs/PS-001.pdf'])
    expect(body.items[0].prespec.products[0]).toEqual({ seq: 1, code: '4321150102', name: '시설 관제 서버' })
    expect(body.items[0].prespec.relatedNoticeNos).toEqual(['NT-001'])
  })

  it('사전규격 결과에 전환된 본공고를 정·역방향 중복 없이 담는다', async () => {
    const response = await GET(request('kind=prespec&from=2026-08-01&to=2026-08-31'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.items[0].prespec.convertedNotices).toEqual([{
      bidNtceNo: 'NT-001', ord: '000', title: '시설 관제 시스템 구축 입찰공고', noticeDate: '2026-08-15',
    }])
  })

  it('계약 상세에 계약번호를 포함한다', async () => {
    const response = await GET(request('kind=contract&from=2026-08-01&to=2026-08-31'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.items[0].contract.contractNo).toBe('CT-001')
  })

  it('페이지와 전체 건수를 분리해 반환한다', async () => {
    await ensurePartitions(handle.db, ['2026-08-16'])
    await handle.db.insert(awards).values({ bidNtceNo: 'AW-002', ord: '000', openingDate: '2026-08-14', title: '측량 장비', bizDiv: '용역', bizDivKey: 'Servc', ntceInsttNm: '대전테크노파크', finalAmount: 500000 })
    const response = await GET(request('kind=award&from=2026-08-01&to=2026-08-31&pageSize=1&page=2'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.total).toBe(2)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].noticeNo).toBe('AW-002')
    expect(body.hasMore).toBe(false)
  })

  it('금액 내림차순 정렬을 적용한다', async () => {
    await ensurePartitions(handle.db, ['2026-08-16'])
    await handle.db.insert(awards).values({ bidNtceNo: 'AW-002', ord: '000', openingDate: '2026-08-14', title: '측량 장비', bizDiv: '용역', bizDivKey: 'Servc', ntceInsttNm: '대전테크노파크', finalAmount: 500000 })
    const response = await GET(request('kind=award&from=2026-08-01&to=2026-08-31&pageSize=10&sort=amountDesc'))
    const body = await response.json()
    expect(body.items.map((item: { amount: number }) => item.amount)).toEqual([1000000, 500000])
  })

  it('잘못된 검색 파라미터를 400으로 거절한다', async () => {
    for (const query of ['kind=bogus&from=2026-08-01&to=2026-08-31', 'kind=award&from=2026-08-01&to=2026-08-31&pageSize=999', 'kind=award&from=2026-08-01&to=bad']) {
      const response = await GET(request(query))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toEqual(expect.any(String))
    }
  })

  it('데이터베이스 주소가 없으면 503을 반환한다', async () => {
    const previous = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    setDbForTesting(undefined)
    try {
      const response = await GET(request('kind=award&from=2026-08-01&to=2026-08-31'))
      expect(response.status).toBe(503)
      expect((await response.json()).error).toContain('DATABASE_URL')
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previous
    }
  })

  it('사전규격 DB가 비어 있고 API 키가 없으면 경고와 함께 빈 결과를 반환한다', async () => {
    await handle.db.delete(prespecs)
    const previousKey = process.env.NARA_API_KEY
    const previousViteKey = process.env.VITE_NARA_API_KEY
    delete process.env.NARA_API_KEY
    delete process.env.VITE_NARA_API_KEY
    try {
      const response = await GET(request('kind=prespec&from=2026-08-01&to=2026-08-31'))
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.items).toEqual([])
      expect(body.source).toBe('db')
      expect(body.warnings[0]).toContain('실시간 조회 실패')
    } finally {
      if (previousKey === undefined) delete process.env.NARA_API_KEY
      else process.env.NARA_API_KEY = previousKey
      if (previousViteKey === undefined) delete process.env.VITE_NARA_API_KEY
      else process.env.VITE_NARA_API_KEY = previousViteKey
    }
  })
})
