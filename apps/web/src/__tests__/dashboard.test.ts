import { addDays, today } from '@nara/api'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ingestJobs, notices } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { GET as getDashboard } from '@/app/api/dashboard/route'
import { parseDashboardParams } from '@/server/dashboard'
import { setAuthUserForTesting } from '@/server/auth'
import { setDbForTesting } from '@/server/db'
import { makeDb, seedAll, TEST_USER } from './helpers'

describe('/api/dashboard', () => {
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

  it('최신 낙찰 청크를 기준으로 대시보드 집계를 반환한다', async () => {
    await handle.db.insert(ingestJobs).values([
      { kind: 'award', chunkStart: '2026-08-15', chunkEnd: '2026-08-15', status: 'done', rows: 112183, updatedAt: new Date('2026-08-15T18:04:11.000Z') },
      { kind: 'notice', chunkStart: '2026-08-15', chunkEnd: '2026-08-15', status: 'done', rows: 1588, updatedAt: new Date('2026-08-15T18:04:11.000Z') },
      { kind: 'contract', chunkStart: '2026-08-15', chunkEnd: '2026-08-15', status: 'pending' },
    ])
    const response = await getDashboard(new Request('http://localhost/api/dashboard?keyword=%EC%8B%9C%EC%84%A4&keyword=%EC%8B%9C%EC%84%A4&profileKeyword=%EC%8B%9C%EC%84%A4&days=1&deadlineDays=7&limit=5'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.range).toEqual({ from: '2026-08-15', to: '2026-08-15' })
    expect(body.award).toMatchObject({ date: '2026-08-15', notices: 1, rows: 112183 })
    expect(body.notice).toEqual({ date: '2026-08-15', count: 1 })
    expect(body.keywords).toEqual([{ keyword: '시설', count: 1 }])
    expect(body.sources.map((source: { kind: string }) => source.kind)).toEqual(['notice', 'award', 'contract', 'prespec'])
    expect(body.sources[1]).toMatchObject({ state: 'ok', rows: 112183, done: 1 })
    expect(body.stale).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'notice' }), expect.objectContaining({ kind: 'award' })]))
  })

  it('활성 프로필 키워드로 마감 임박 공고를 걸러낸다', async () => {
    const closeDate = addDays(today(), 2)
    await handle.db.insert(notices).values({
      bidNtceNo: 'NT-FUTURE', ord: '000', title: '시설 마감 공고', noticeDate: today(), ntceInsttNm: '시설기관',
      bidClose: `${closeDate} 10:00`, opening: `${closeDate} 11:00`, estimatedPrice: 2000, detailUrl: 'https://example.com/notices/NT-FUTURE/detail',
    })
    const response = await getDashboard(new Request('http://localhost/api/dashboard?profileKeyword=%EC%8B%9C%EC%84%A4&limit=1'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.deadlines).toHaveLength(1)
    expect(body.deadlines[0]).toMatchObject({ id: 'notice-NT-FUTURE-000', noticeNo: 'NT-FUTURE', amount: 2000, url: 'https://example.com/notices/NT-FUTURE/detail' })
  })

  it('반복 키워드를 trim하고 중복 없이 보존한다', () => {
    expect(parseDashboardParams(new URLSearchParams('keyword=%20%EC%8B%9C%EC%84%A4%20&keyword=%EC%8B%9C%EC%84%A4&profileKeyword=%20%EC%A0%84%EC%82%B0%EC%9E%A5%EB%B9%84'))).toEqual({
      keywords: ['시설'], profileKeywords: ['전산장비'], days: 1, deadlineDays: 7, limit: 5,
    })
  })

  it('범위를 벗어난 집계 일수는 400으로 반환한다', async () => {
    const response = await getDashboard(new Request('http://localhost/api/dashboard?days=99'))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('days')
  })
})
