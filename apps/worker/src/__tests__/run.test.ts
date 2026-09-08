import { afterEach, describe, expect, it } from 'vitest'
import { configureNara } from '@nara/api'
import { createTestDb } from '@nara/db/testing'
import { ingestJobs, resultRows } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { eq, sql } from 'drizzle-orm'
import { awards, bidders, companies, agencies } from '@nara/db'
import { runOnce } from '../run'

const ok = (body: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body } }) })
const errorResponse = (code: string) => ({ ok: true, status: 200, text: async () => JSON.stringify({ 'nkoneps.com.response.ResponseError': { header: { resultCode: code, resultMsg: 'test error' } } }) })
const fetchWith = (fn: (url: string) => unknown) => fn as unknown as typeof fetch

async function addJob(db: DbHandle['db'], chunkStart: string, kind = 'award') {
  await db.insert(ingestJobs).values({ kind, bizDiv: kind === 'award' ? 'Thng' : '', chunkStart, chunkEnd: chunkStart })
}

describe('runOnce', () => {
  let handle: DbHandle | undefined
  afterEach(async () => { await handle?.close(); handle = undefined })

  it('예산 소진 후 체크포인트부터 재개해 중복 없이 완주한다', async () => {
    handle = await createTestDb(); await addJob(handle.db, '2026-08-15')
    let clock = 0
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith((url) => {
      const pageNo = Number(new URL(url).searchParams.get('pageNo')); clock++
      const row = { bidNtceNo: 'A', bidNtceOrd: '000', bidNtceNm: '측량 용역', bsnsDivNm: '용역', opengDate: '20260815', opengRank: String(pageNo), bidprcCorpBizrno: `B${pageNo}`, bidprcCorpNm: `업체${pageNo}`, bidprcAmt: String(100 + pageNo), sucsfYn: pageNo === 1 ? 'Y' : 'N', ntceInsttCd: 'I1', ntceInsttNm: '기관' }
      return ok({ items: [row], totalCount: 5, numOfRows: 1, pageNo })
    }) })
    const first = await runOnce({ db: handle.db, budgetMs: 2, now: () => clock })
    expect(first).toMatchObject({ claimed: 1, completed: 0, deferred: 1, rows: 2, requests: 2 })
    expect((await handle.db.select().from(ingestJobs))[0]).toMatchObject({ status: 'pending', nextPage: 3, rows: 2 })
    const second = await runOnce({ db: handle.db, budgetMs: 100, now: () => clock })
    expect(second).toMatchObject({ claimed: 1, completed: 1, rows: 3, requests: 3 })
    expect((await handle.db.select().from(ingestJobs))[0]).toMatchObject({ status: 'done', nextPage: 6, rows: 5 })
    expect(await handle.db.select().from(bidders)).toHaveLength(5)
    expect((await handle.db.select().from(awards))[0].bidderCount).toBe(5)
  })

  it('완료한 청크를 다시 실행해도 모든 행 수가 변하지 않는다', async () => {
    handle = await createTestDb(); await addJob(handle.db, '2026-08-15')
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith((url) => {
      const pageNo = Number(new URL(url).searchParams.get('pageNo'))
      return ok({ items: [{ bidNtceNo: 'A', bidNtceOrd: '000', bidNtceNm: '측량', opengDate: '20260815', opengRank: String(pageNo), bidprcCorpBizrno: String(pageNo), bidprcCorpNm: `업체${pageNo}`, ntceInsttCd: 'I1', ntceInsttNm: '기관' }], totalCount: 2, numOfRows: 1, pageNo })
    }) })
    await runOnce({ db: handle.db, budgetMs: 1000 })
    const before = [await handle.db.select().from(awards), await handle.db.select().from(bidders), await handle.db.select().from(companies), await handle.db.select().from(agencies)]
    await handle.db.update(ingestJobs).set({ status: 'pending', nextPage: 1, rows: 0, totalCount: null }).where(eq(ingestJobs.kind, 'award'))
    await runOnce({ db: handle.db, budgetMs: 1000 })
    expect(await handle.db.select().from(awards)).toHaveLength(before[0].length); expect(await handle.db.select().from(bidders)).toHaveLength(before[1].length); expect(await handle.db.select().from(companies)).toHaveLength(before[2].length); expect(await handle.db.select().from(agencies)).toHaveLength(before[3].length)
  })

  it('재시도하지 않는 API 오류는 failed로 분류한다', async () => {
    handle = await createTestDb(); await addJob(handle.db, '2026-08-15')
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith(() => errorResponse('07')) })
    const result = await runOnce({ db: handle.db })
    expect(result).toMatchObject({ claimed: 1, failed: 1 }); expect((await handle.db.select().from(ingestJobs))[0]).toMatchObject({ status: 'failed', attempts: 1 }); expect((await handle.db.select().from(ingestJobs))[0].error).toContain('[07]')
  })

  it('재시도 가능한 API 오류는 pending으로 돌려보낸다', async () => {
    handle = await createTestDb(); await addJob(handle.db, '2026-08-15')
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith(() => errorResponse('22')) })
    const result = await runOnce({ db: handle.db })
    expect(result).toMatchObject({ claimed: 1, failed: 0 }); expect((await handle.db.select().from(ingestJobs))[0]).toMatchObject({ status: 'pending', attempts: 1 })
  })

  it('데이터 없음 응답은 행 없이 done 처리한다', async () => {
    handle = await createTestDb(); await addJob(handle.db, '2026-08-15')
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith(() => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '03', resultMsg: 'No Data' }, body: {} } }) })) })
    const result = await runOnce({ db: handle.db })
    expect(result).toMatchObject({ claimed: 1, completed: 1, rows: 0, requests: 1 }); expect((await handle.db.select().from(ingestJobs))[0]).toMatchObject({ status: 'done', rows: 0 })
  })

  it('30분 넘게 갱신되지 않은 running 잡을 다시 선점한다', async () => {
    handle = await createTestDb(); await addJob(handle.db, '2026-08-15')
    await handle.db.update(ingestJobs).set({ status: 'running', updatedAt: sql`now() - interval '1 hour'` }).where(eq(ingestJobs.kind, 'award'))
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith(() => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '03', resultMsg: 'No Data' }, body: {} } }) })) })
    const result = await runOnce({ db: handle.db })
    expect(result).toMatchObject({ claimed: 1, completed: 1 }); expect((await handle.db.select().from(ingestJobs))[0]).toMatchObject({ status: 'done' })
  })

  it('방금 갱신된 running 잡은 선점하지 않는다', async () => {
    handle = await createTestDb(); await addJob(handle.db, '2026-08-15')
    await handle.db.update(ingestJobs).set({ status: 'running', updatedAt: sql`now()` }).where(eq(ingestJobs.kind, 'award'))
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith(() => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '03', resultMsg: 'No Data' }, body: {} } }) })) })
    const result = await runOnce({ db: handle.db })
    expect(result).toMatchObject({ claimed: 0 }); expect((await handle.db.select().from(ingestJobs))[0]).toMatchObject({ status: 'running' })
  })

  it('chunk_start가 최신인 잡을 먼저 선점한다', async () => {
    handle = await createTestDb(); await addJob(handle.db, '2026-08-14'); await addJob(handle.db, '2026-08-15')
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith(() => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '03' }, body: {} } }) })) })
    await runOnce({ db: handle.db, maxJobs: 1 })
    const rows = await handle.db.select().from(ingestJobs)
    expect(rows.find((row) => row.chunkStart === '2026-08-15')?.status).toBe('done'); expect(rows.find((row) => row.chunkStart === '2026-08-14')?.status).toBe('pending')
  })

  it('deferred가 여섯 번 누적되어도 일곱 번째 실행에서 재개한다', async () => {
    handle = await createTestDb(); await addJob(handle.db, '2026-08-15')
    let clock = 0
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith((url) => {
      const pageNo = Number(new URL(url).searchParams.get('pageNo')); clock++
      return ok({ items: [{ bidNtceNo: 'A', bidNtceOrd: '000', bidNtceNm: '측량', opengDate: '20260815', opengRank: String(pageNo), bidprcCorpBizrno: `B${pageNo}`, bidprcCorpNm: `업체${pageNo}` }], totalCount: 7, numOfRows: 1, pageNo })
    }) })
    for (let i = 0; i < 6; i++) expect(await runOnce({ db: handle.db, budgetMs: 1, now: () => clock })).toMatchObject({ claimed: 1, deferred: 1 })
    const deferred = (await handle.db.select().from(ingestJobs))[0]
    expect(deferred).toMatchObject({ status: 'pending', attempts: 0, deferrals: 6, nextPage: 7 })
    expect(await runOnce({ db: handle.db, budgetMs: 100, now: () => clock })).toMatchObject({ claimed: 1, completed: 1 })
    expect((await handle.db.select().from(ingestJobs))[0]).toMatchObject({ status: 'done', attempts: 0, deferrals: 6 })
  })

  it('재시도 가능한 오류가 최대 횟수에 도달하면 failed로 고정한다', async () => {
    handle = await createTestDb(); await addJob(handle.db, '2026-08-15')
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith(() => errorResponse('22')) })
    for (let i = 0; i < 5; i++) await runOnce({ db: handle.db, budgetMs: 100 })
    const job = (await handle.db.select().from(ingestJobs))[0]
    expect(job).toMatchObject({ status: 'failed', attempts: 5 })
    expect(job.error).toContain('[22]')
    expect((await runOnce({ db: handle.db, budgetMs: 100 })).claimed).toBe(0)
  })

  it('성공하면 attempts가 0으로 돌아온다', async () => {
    handle = await createTestDb(); await addJob(handle.db, '2026-08-15')
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith(() => errorResponse('22')) })
    await runOnce({ db: handle.db, budgetMs: 100 })
    await runOnce({ db: handle.db, budgetMs: 100 })
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith(() => ok({ items: [{ bidNtceNo: 'A', bidNtceOrd: '000', bidNtceNm: '측량', opengDate: '20260815', opengRank: '1', bidprcCorpBizrno: 'B1', bidprcCorpNm: '업체1' }], totalCount: 1, numOfRows: 1, pageNo: 1 })) })
    await runOnce({ db: handle.db, budgetMs: 100 })
    expect((await handle.db.select().from(ingestJobs))[0]).toMatchObject({ status: 'done', attempts: 0 })
  })

  it('resultRows가 배열 결과에서도 잡을 선점한다', () => {
    const row = { id: 1 }
    expect(resultRows([row])).toEqual([row])
    expect(resultRows({ rows: [row] })).toEqual([row])
  })
})
