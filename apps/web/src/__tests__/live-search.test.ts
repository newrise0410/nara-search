import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notices } from '@nara/db'
import type { DbHandle, NaraDb } from '@nara/db'
import { GET } from '@/app/api/search/route'
import { setAuthUserForTesting } from '@/server/auth'
import { setDbForTesting } from '@/server/db'
import { makeDb, seedAll, TEST_USER } from './helpers'

const ok = (body: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body } }) })
const request = (query: string) => new Request(`http://localhost/api/search?${query}`)

describe('/api/search source=live', () => {
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

  it('실시간 조회 결과를 돌려주고 notices에 업서트한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const operation = new URL(url).pathname.split('/').pop() ?? ''
      const count = operation.includes('Servc') ? 2 : 1
      const items = Array.from({ length: count }, (_, index) => ({
        bidNtceNo: `LIVE-${operation}-${index}`,
        bidNtceOrd: '000',
        bidNtceNm: `시설 ${operation} ${index}`,
        bidNtceDt: '2026-08-01 10:00:00',
        ntceSpecDocUrl1: 'https://f/1', ntceSpecFileNm1: '과업지시서.hwp',
      }))
      return ok({ items, totalCount: count, pageNo: 1, numOfRows: 999 })
    }))
    const response = await GET(request('kind=notice&source=live&keyword=%EC%8B%9C%EC%84%A4&from=2026-08-01&to=2026-08-28'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.source).toBe('live')
    expect(body.live.requests).toBe(4)
    expect(body.live.chunks).toBe(4)
    expect(body.live.upserted).toBeGreaterThanOrEqual(1)
    expect(body.items[0].id).toMatch(/^notice-/)
    expect(body.items[0].notice.attachments).toHaveLength(1)
    const stored = await handle.db.select().from(notices)
    expect(stored.some((row) => row.bidNtceNo === body.items[0].noticeNo)).toBe(true)
    expect(stored.find((row) => row.bidNtceNo === body.items[0].noticeNo)?.attachments).toHaveLength(1)
  })

  it('12개월을 넘는 기간은 400으로 거절한다', async () => {
    const response = await GET(request('kind=notice&source=live&keyword=%EC%8B%9C%EC%84%A4&from=2026-01-01&to=2027-01-01'))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('12개월')
  })

  it('낙찰 실시간 조회는 400으로 거절한다', async () => {
    const response = await GET(request('kind=award&source=live&keyword=%EC%8B%9C%EC%84%A4&from=2026-08-01&to=2026-08-28'))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('입찰공고만')
  })

  it('검색어가 없으면 400으로 거절한다', async () => {
    const response = await GET(request('kind=notice&source=live&from=2026-08-01&to=2026-08-28'))
    expect(response.status).toBe(400)
  })

  it('NARA_API_KEY가 없으면 503을 반환한다', async () => {
    delete process.env.NARA_API_KEY
    delete process.env.VITE_NARA_API_KEY
    const response = await GET(request('kind=notice&source=live&keyword=%EC%8B%9C%EC%84%A4&from=2026-08-01&to=2026-08-28'))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toContain('NARA_API_KEY')
  })

  it('업서트가 실패해도 결과와 경고를 함께 돌려준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({
      items: [{ bidNtceNo: 'LIVE-FAIL', bidNtceNm: '시설 공고', bidNtceDt: '2026-08-01 10:00:00' }],
      totalCount: 1, pageNo: 1, numOfRows: 999,
    })))
    setDbForTesting(new Proxy({}, { get() { throw new Error('db down') } }) as unknown as NaraDb)
    const response = await GET(request('kind=notice&source=live&keyword=%EC%8B%9C%EC%84%A4&from=2026-08-01&to=2026-08-28'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    expect(body.warnings[0]).toContain('DB 저장 실패')
  })
})
