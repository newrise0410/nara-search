import { afterEach, describe, expect, it } from 'vitest'
import { setDbForTesting } from '@/server/db'
import { GET } from '@/app/api/cron/alerts/route'

const originalSecret = process.env.CRON_SECRET
const originalDatabaseUrl = process.env.DATABASE_URL

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = originalDatabaseUrl
  setDbForTesting(undefined)
})

describe('알림 CRON API', () => {
  it('CRON_SECRET이 없으면 503을 반환한다', async () => {
    delete process.env.CRON_SECRET
    const response = await GET(new Request('http://localhost/api/cron/alerts'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'CRON_SECRET이 설정되지 않았습니다.' })
  })

  it('authorization이 없거나 다르면 401을 반환한다', async () => {
    process.env.CRON_SECRET = 'secret'
    expect((await GET(new Request('http://localhost/api/cron/alerts'))).status).toBe(401)
    expect((await GET(new Request('http://localhost/api/cron/alerts', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401)
  })

  it('인증이 맞고 DATABASE_URL이 없으면 503을 반환한다', async () => {
    process.env.CRON_SECRET = 'secret'
    delete process.env.DATABASE_URL
    setDbForTesting(undefined)
    const response = await GET(new Request('http://localhost/api/cron/alerts', { headers: { authorization: 'Bearer secret' } }))
    expect(response.status).toBe(503)
  })
})
