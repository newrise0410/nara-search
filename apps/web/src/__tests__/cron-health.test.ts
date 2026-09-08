import { afterEach, describe, expect, it, vi } from 'vitest'
import { ingestJobs } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { setDbForTesting } from '@/server/db'
import { GET } from '@/app/api/cron/health/route'
import { makeDb } from './helpers'

const originalSecret = process.env.CRON_SECRET
const originalDatabaseUrl = process.env.DATABASE_URL

let handle: DbHandle | undefined

afterEach(async () => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = originalDatabaseUrl
  setDbForTesting(undefined)
  await handle?.close()
  handle = undefined
  vi.unstubAllEnvs()
})

describe('상태 점검 CRON API', () => {
  it('CRON_SECRET이 없으면 503을 반환한다', async () => {
    delete process.env.CRON_SECRET
    const response = await GET(new Request('http://localhost/api/cron/health'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'CRON_SECRET이 설정되지 않았습니다.' })
  })

  it('authorization이 다르면 401을 반환한다', async () => {
    process.env.CRON_SECRET = 'secret'
    const response = await GET(new Request('http://localhost/api/cron/health', { headers: { authorization: 'Bearer wrong' } }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
  })

  it('인증과 상태 점검이 맞으면 stale이 없어 ok=true를 반환한다', async () => {
    process.env.CRON_SECRET = 'secret'
    handle = await makeDb()
    setDbForTesting(handle.db)
    const response = await GET(new Request('http://localhost/api/cron/health', { headers: { authorization: 'Bearer secret' } }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body).toMatchObject({ ok: true, stale: [], jobs: { running: 0, pending: 0, failed: 0 }, alerts: null })
  })

  it('stale 수집이 있으면 ok=false와 정체 정보를 반환한다', async () => {
    process.env.CRON_SECRET = 'secret'
    handle = await makeDb()
    await handle.db.insert(ingestJobs).values({
      kind: 'award', chunkStart: '2026-08-15', chunkEnd: '2026-08-15', status: 'done',
      updatedAt: new Date(Date.now() - 27 * 60 * 60 * 1000),
    })
    setDbForTesting(handle.db)
    const response = await GET(new Request('http://localhost/api/cron/health', { headers: { authorization: 'Bearer secret' } }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.ok).toBe(false)
    expect(body.stale).toEqual([{ kind: 'award', hoursSinceLastDone: 27 }])
  })

  it('저장 용량이 예산을 넘으면 ok=false를 반환한다', async () => {
    process.env.CRON_SECRET = 'secret'
    vi.stubEnv('STORAGE_BUDGET_BYTES', '1000000')
    handle = await makeDb()
    setDbForTesting(handle.db)
    const response = await GET(new Request('http://localhost/api/cron/health', { headers: { authorization: 'Bearer secret' } }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.ok).toBe(false)
    expect(body.storage.overBudget).toBe(true)
  })
})
