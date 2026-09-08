import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { alertRuns, awards, ingestJobs } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { rebuildAwardStats } from 'worker'
import { setAuthUserForTesting } from '@/server/auth'
import { setDbForTesting } from '@/server/db'
import { GET as getStatus } from '@/app/api/status/route'
import { GET as getCompetitors } from '@/app/api/competitors/route'
import { makeDb, seedAll, TEST_USER } from './helpers'

describe('/api/status와 /api/competitors', () => {
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

  it('수집 잡 상태를 네 종류 순서와 카운트로 반환한다', async () => {
    await handle.db.insert(ingestJobs).values([
      { kind: 'notice', chunkStart: '2026-08-15', chunkEnd: '2026-08-15', status: 'done', updatedAt: new Date('2026-08-16T00:00:00.000Z') },
      { kind: 'notice', chunkStart: '2026-08-16', chunkEnd: '2026-08-16', status: 'pending' },
      { kind: 'award', bizDiv: 'Servc', chunkStart: '2026-08-15', chunkEnd: '2026-08-15', status: 'failed' },
    ])
    const response = await getStatus()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.kinds.map((kind: { kind: string }) => kind.kind)).toEqual(['notice', 'award', 'contract', 'prespec'])
    expect(body.kinds[0]).toMatchObject({ pending: 1, failed: 0, done: 1, latestChunkStart: '2026-08-15' })
    expect(body.kinds[1]).toMatchObject({ pending: 0, failed: 1, done: 0 })
    expect(body.kinds[2]).toMatchObject({ pending: 0, failed: 0, done: 0 })
  })

  it('coverage를 done 청크의 범위와 행 수로 계산한다', async () => {
    await handle.db.insert(ingestJobs).values([
      { kind: 'notice', chunkStart: '2026-07-01', chunkEnd: '2026-07-31', status: 'done', rows: 100 },
      { kind: 'notice', chunkStart: '2026-08-01', chunkEnd: '2026-08-31', status: 'done', rows: 50 },
      { kind: 'notice', chunkStart: '2026-09-01', chunkEnd: '2026-09-30', status: 'pending', rows: 999 },
    ])
    const body = await (await getStatus()).json()
    expect(body.kinds[0].coverage).toEqual({ from: '2026-07-01', to: '2026-08-31', rows: 150 })
    expect(body.kinds[2].coverage).toEqual({ from: null, to: null, rows: 0 })
  })

  it('최근 알림 실행과 종류 전체 잡 합계를 반환한다', async () => {
    await handle.db.insert(ingestJobs).values([
      { kind: 'notice', chunkStart: '2026-08-15', chunkEnd: '2026-08-15', status: 'running' },
      { kind: 'award', chunkStart: '2026-08-15', chunkEnd: '2026-08-15', status: 'pending' },
      { kind: 'contract', chunkStart: '2026-08-15', chunkEnd: '2026-08-15', status: 'failed' },
    ])
    await handle.db.insert(alertRuns).values({
      startedAt: new Date('2026-08-31T00:00:00.000Z'),
      finishedAt: new Date('2026-08-31T00:00:05.000Z'),
      matched: 2,
      sent: 2,
      failed: 0,
      error: null,
    })
    const body = await (await getStatus()).json()
    expect(body.alerts).toMatchObject({ matched: 2, sent: 2, failed: 0, error: null })
    expect(body.jobs).toEqual({ running: 1, pending: 1, failed: 1 })
  })

  it('마지막 done이 26시간을 넘긴 종류만 stale로 표시한다', async () => {
    const staleAt = new Date(Date.now() - 27 * 60 * 60 * 1000)
    await handle.db.insert(ingestJobs).values([
      { kind: 'award', chunkStart: '2026-08-15', chunkEnd: '2026-08-15', status: 'done', updatedAt: staleAt },
      { kind: 'contract', chunkStart: '2026-08-15', chunkEnd: '2026-08-15', status: 'pending' },
    ])
    const body = await (await getStatus()).json()
    expect(body.stale).toHaveLength(1)
    expect(body.stale[0]).toMatchObject({ kind: 'award', hoursSinceLastDone: 27 })
  })

  it('등록 업체의 투찰·낙찰·계약 통계를 반환한다', async () => {
    const response = await getCompetitors(new Request('http://localhost/api/competitors?bizNo=3148100001'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.items[0]).toMatchObject({
      bizNo: '3148100001', name: '나래기술', participated: 2, won: 1, contracts: 1, amount: 1500000,
      agencies: ['대전테크노파크'], lastSeen: '2026-08-18',
    })
  })

  it('낙찰 합계가 소수점을 보존한다', async () => {
    await handle.db.insert(awards).values({
      bidNtceNo: 'AW-FX', ord: '000', openingDate: '2026-08-15', title: '외자 낙찰', bizDivKey: 'Frgcpt',
      ntceInsttNm: '대전테크노파크', finalAmount: 123456.78, winnerBizNo: '9998100003',
    })
    const response = await getCompetitors(new Request('http://localhost/api/competitors?bizNo=9998100003'))
    const body = await response.json()
    expect(body.items[0]).toMatchObject({ won: 1, amount: 123456.78 })
  })

  it('하이픈 없는 사업자번호로도 하이픈 표기 낙찰을 찾는다', async () => {
    await handle.db.insert(awards).values({
      bidNtceNo: 'AW-HY', ord: '000', openingDate: '2026-08-15', bizDivKey: 'Thng',
      ntceInsttNm: '대전테크노파크', finalAmount: 700000, winnerBizNo: '999-81-00003',
    })
    const response = await getCompetitors(new Request('http://localhost/api/competitors?bizNo=9998100003'))
    const body = await response.json()
    expect(body.items[0]).toMatchObject({ won: 1, amount: 700000 })
  })

  it('사업자번호가 없으면 400을 반환한다', async () => {
    const response = await getCompetitors(new Request('http://localhost/api/competitors'))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toEqual(expect.any(String))
  })

  it('storage에 DB 크기·예산·보존 창을 담아 반환한다', async () => {
    const body = await (await getStatus()).json()
    expect(body.storage.databaseBytes).toBeGreaterThan(0)
    expect(body.storage.budgetBytes).toBe(500 * 1024 * 1024)
    expect(body.storage.usedRatio).toBeGreaterThanOrEqual(0)
    expect(body.storage.usedRatio).toBeLessThanOrEqual(1)
    expect(body.storage.overBudget).toBe(false)
    expect(body.storage.retention).toEqual({ bidders: 7, notices: 60, contracts: 30 })
  })

  it('파티션 자식 크기는 부모 이름으로 합산한다', async () => {
    const body = await (await getStatus()).json()
    expect(body.storage.tables.some((table: { name: string }) => table.name === 'awards')).toBe(true)
    expect(body.storage.tables.every((table: { name: string }) => !/^awards_\d{4}_\d{2}$/.test(table.name))).toBe(true)
  })

  it('stats에 award_stats 집계 창과 최신성을 담아 반환한다', async () => {
    await handle.db.insert(awards).values({
      bidNtceNo: 'AW-STATS', ord: '000', openingDate: '2026-08-15', bizDivKey: 'Servc',
      ntceInsttCd: 'DTP', awardMethod: '소액수의견적', estimatedPrice: 50_000_000, finalRate: 90, lowerLimitRate: 85,
    })
    await rebuildAwardStats({ db: handle.db, month: '2026-08' })
    const body = await (await getStatus()).json()
    expect(body.stats).toMatchObject({
      window: { from: '2025-09-01', to: '2026-08-31' },
      cells: expect.any(Number),
      stale: false,
    })
    expect(body.stats.cells).toBeGreaterThan(0)
    expect(body.stats.computedAt).toEqual(expect.any(String))
  })
})
