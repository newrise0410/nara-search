import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureNara } from '@nara/api'
import { createTestDb } from '@nara/db/testing'
import { awards, bidders, ingestJobs } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { runOnce } from '../run'

const cliTest = vi.hoisted(() => ({ handle: undefined as DbHandle | undefined }))
vi.mock('@nara/db', async () => {
  const actual = await vi.importActual<typeof import('@nara/db')>('@nara/db')
  return {
    ...actual,
    createDb: () => {
      if (!cliTest.handle) throw new Error('CLI 테스트 DB가 설정되지 않았습니다.')
      return { db: cliTest.handle.db, close: async () => {} }
    },
  }
})

const ok = (body: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body } }) })
const fetchWith = (fn: (url: string) => unknown) => fn as unknown as typeof fetch

describe('낙찰 summary-only 수집', () => {
  let handle: DbHandle | undefined
  afterEach(async () => { await handle?.close(); handle = undefined; cliTest.handle = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it('summary-only 백필은 bidders에 쓰지 않고 awards 요약만 채운다', async () => {
    handle = await createTestDb()
    await handle.db.insert(ingestJobs).values({ kind: 'award', bizDiv: 'Servc', chunkStart: '2026-08-15', chunkEnd: '2026-08-15' })
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith(() => ok({
      items: [
        { bidNtceNo: 'A', bidNtceOrd: '000', bidNtceNm: '요약 공고', opengDate: '20260815', opengRank: '1', bidprcCorpBizrno: '1', bidprcCorpNm: '첫 업체', bidprcAmt: '100', bidprcRt: '88', sucsfYn: 'Y' },
        { bidNtceNo: 'A', bidNtceOrd: '000', bidNtceNm: '요약 공고', opengDate: '20260815', opengRank: '2', bidprcCorpBizrno: '2', bidprcCorpNm: '둘 업체', bidprcAmt: '101', bidprcRt: '90', sucsfYn: 'N' },
      ], totalCount: 2, numOfRows: 999, pageNo: 1,
    })) })
    await runOnce({ db: handle.db, budgetMs: 1000, summaryOnly: true })
    expect(await handle.db.select().from(bidders)).toHaveLength(0)
    const [award] = await handle.db.select().from(awards)
    expect(award?.bidderSummary?.n).toBe(2)
    expect(award?.bidderCount).toBe(2)
  })

  it('공고가 페이지 경계에 걸쳐도 한 요약으로 합친다', async () => {
    handle = await createTestDb()
    await handle.db.insert(ingestJobs).values({ kind: 'award', bizDiv: 'Servc', chunkStart: '2026-08-15', chunkEnd: '2026-08-15' })
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith((url) => {
      const pageNo = Number(new URL(url).searchParams.get('pageNo'))
      const rows = [
        { bidNtceNo: 'BOUNDARY', bidNtceOrd: '000', bidNtceNm: '경계 공고', opengDate: '20260815', opengRank: '1', bidprcCorpBizrno: '1', bidprcCorpNm: '첫 업체', bidprcRt: '88', sucsfYn: 'Y' },
        { bidNtceNo: 'BOUNDARY', bidNtceOrd: '000', bidNtceNm: '경계 공고', opengDate: '20260815', opengRank: '2', bidprcCorpBizrno: '2', bidprcCorpNm: '둘 업체', bidprcRt: '90', sucsfYn: 'N' },
        { bidNtceNo: 'BOUNDARY', bidNtceOrd: '000', bidNtceNm: '경계 공고', opengDate: '20260815', opengRank: '3', bidprcCorpBizrno: '3', bidprcCorpNm: '셋 업체', bidprcRt: '92', sucsfYn: 'N' },
      ]
      return ok({ items: pageNo === 1 ? rows.slice(0, 2) : rows.slice(2), totalCount: 3, numOfRows: 2, pageNo })
    }) })
    await runOnce({ db: handle.db, budgetMs: 1000, summaryOnly: true })
    const [award] = await handle.db.select().from(awards)
    expect(await handle.db.select().from(awards)).toHaveLength(1)
    expect(award?.bidderSummary?.n).toBe(3)
    expect(award?.bidderSummary?.top).toHaveLength(3)
  })

  it('summary-only 예산이 소진되면 아무것도 저장하지 않고 잡을 failed로 남긴다', async () => {
    handle = await createTestDb()
    await handle.db.insert(ingestJobs).values({ kind: 'award', bizDiv: 'Servc', chunkStart: '2026-08-15', chunkEnd: '2026-08-15' })
    configureNara({ serviceKey: 'test', baseUrl: 'https://test', fetchImpl: fetchWith(() => ok({
      items: [{ bidNtceNo: 'PARTIAL', bidNtceOrd: '000', bidNtceNm: '부분 공고', opengDate: '20260815', opengRank: '1', bidprcCorpBizrno: '1', bidprcCorpNm: '업체', bidprcRt: '88' }],
      totalCount: 2, numOfRows: 1, pageNo: 1,
    })) })
    let t = -600
    const result = await runOnce({ db: handle.db, budgetMs: 1000, summaryOnly: true, now: () => (t += 600) })
    expect(result).toMatchObject({ claimed: 1, completed: 0, deferred: 0, failed: 1, rows: 1 })
    expect(await handle.db.select().from(awards)).toHaveLength(0)
    expect(await handle.db.select().from(bidders)).toHaveLength(0)
    const [job] = await handle.db.select().from(ingestJobs)
    expect(job?.status).toBe('failed')
    expect(job?.error).toContain('--budget-ms')
    expect(job?.error).toContain('재시도로는 진전이 없다')
  })

  it('summary-only 백필이 두 번 연속 무진전이면 유한하게 멈춘다', async () => {
    handle = await createTestDb()
    cliTest.handle = handle
    vi.stubEnv('DATABASE_URL', 'test://worker')
    const runModule = await import('../run')
    const runOnceSpy = vi.spyOn(runModule, 'runOnce').mockResolvedValue({ claimed: 1, completed: 0, deferred: 1, failed: 0, rows: 117882, requests: 1, elapsedMs: 1 })
    const { main } = await import('../cli')

    expect(await main(['backfill', '--kind', 'award', '--from', '2026-08-15', '--to', '2026-08-15', '--summary-only'])).toBe(1)
    expect(runOnceSpy).toHaveBeenCalledTimes(2)
  })
})
