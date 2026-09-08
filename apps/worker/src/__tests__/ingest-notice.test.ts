import { afterEach, describe, expect, it } from 'vitest'
import { configureNara } from '@nara/api'
import { createTestDb } from '@nara/db/testing'
import { ingestJobs, notices } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { eq } from 'drizzle-orm'
import { planJobs } from '../plan'
import { runOnce } from '../run'

const ok = (body: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body } }) })
const errorResponse = (code: string) => ({ ok: true, status: 200, text: async () => JSON.stringify({ 'nkoneps.com.response.ResponseError': { header: { resultCode: code, resultMsg: 'test error' } } }) })
const fetchWith = (fn: (url: string) => unknown) => fn as unknown as typeof fetch

describe('notice ingest', () => {
  let handle: DbHandle | undefined
  afterEach(async () => { await handle?.close(); handle = undefined })

  it('업무구분 잡은 입찰공고정보서비스로 첨부까지 저장한다', async () => {
    handle = await createTestDb()
    await handle.db.insert(ingestJobs).values({ kind: 'notice', bizDiv: 'Servc', chunkStart: '2026-08-01', chunkEnd: '2026-08-31' })
    const urls: string[] = []
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith((url) => {
      urls.push(url)
      return ok({ items: [{
        bidNtceNo: 'B1', bidNtceOrd: '000', bidNtceNm: '시설 용역', bidNtceDt: '2026-08-05 10:00:00', bidNtceDtlUrl: 'https://d/B1',
        ntceSpecDocUrl1: 'https://f/1', ntceSpecFileNm1: '과업지시서.hwp',
      }], totalCount: 1, numOfRows: 999, pageNo: 1 })
    }) })
    const result = await runOnce({ db: handle.db, budgetMs: 1000 })
    expect(result).toMatchObject({ claimed: 1, completed: 1, rows: 1 })
    expect(urls.some((url) => url.includes('getBidPblancListInfoServcPPSSrch'))).toBe(true)
    const [row] = await handle.db.select().from(notices)
    expect(row.attachments).toHaveLength(1)
    expect(row.detailUrl).toBe('https://d/B1')
    expect(row.bizDiv).toBe('용역')
    expect(row.source).toBe('bidpublic')
  })

  it('입찰공고정보서비스가 미승인이면 표준서비스로 폴백하고 사유를 남긴다', async () => {
    handle = await createTestDb()
    await handle.db.insert(ingestJobs).values({ kind: 'notice', bizDiv: 'Servc', chunkStart: '2026-08-01', chunkEnd: '2026-08-31' })
    const urls: string[] = []
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith((url) => {
      urls.push(url)
      if (url.includes('BidPublicInfoService')) return errorResponse('20')
      return ok({ items: [{ bidNtceNo: 'S1', bidNtceOrd: '000', bidNtceNm: '표준 공고', bidNtceDate: '20260805' }], totalCount: 1, numOfRows: 999, pageNo: 1 })
    }) })
    const result = await runOnce({ db: handle.db, budgetMs: 1000 })
    expect(result).toMatchObject({ claimed: 1, completed: 1, rows: 1 })
    const [job] = await handle.db.select().from(ingestJobs)
    expect(job.status).toBe('done')
    expect(job.error).toContain('폴백')
    expect(job.error).toContain('[20]')
    const [row] = await handle.db.select().from(notices)
    expect(row.attachments).toEqual([])
    expect(row.source).toBe('opnstd')
    expect(urls.some((url) => url.includes('getDataSetOpnStdBidPblancInfo'))).toBe(true)
  })

  it('biz_div가 빈 레거시 잡은 표준서비스를 그대로 쓴다', async () => {
    handle = await createTestDb()
    await handle.db.insert(ingestJobs).values({ kind: 'notice', bizDiv: '', chunkStart: '2026-08-01', chunkEnd: '2026-08-31' })
    const urls: string[] = []
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith((url) => {
      urls.push(url)
      return ok({ items: [{ bidNtceNo: 'S1', bidNtceOrd: '000', bidNtceNm: '표준 공고', bidNtceDate: '20260805' }], totalCount: 1, numOfRows: 999, pageNo: 1 })
    }) })
    await runOnce({ db: handle.db, budgetMs: 1000 })
    expect(urls.every((url) => url.includes('PubDataOpnStdService'))).toBe(true)
    expect(urls.filter((url) => url.includes('BidPublicInfoService'))).toHaveLength(0)
  })

  it('planJobs가 공고를 업무구분 4개로 예약한다', async () => {
    handle = await createTestDb()
    const result = await planJobs(handle.db, { kind: 'notice', from: '2026-08-01', to: '2026-08-28' })
    expect(result).toMatchObject({ created: 4 })
    const rows = await handle.db.select().from(ingestJobs).where(eq(ingestJobs.kind, 'notice'))
    expect(rows.map((row) => row.bizDiv).sort()).toEqual(['Cnstwk', 'Frgcpt', 'Servc', 'Thng'])
    expect(new Set(rows.map((row) => row.chunkStart))).toEqual(new Set(['2026-08-01']))
  })
})
