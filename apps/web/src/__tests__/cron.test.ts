import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/api/cron/ingest/route'

describe('/api/cron/ingest', () => {
  const previousSecret = process.env.CRON_SECRET
  const previousKey = process.env.NARA_API_KEY
  const previousViteKey = process.env.VITE_NARA_API_KEY

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousSecret
    if (previousKey === undefined) delete process.env.NARA_API_KEY
    else process.env.NARA_API_KEY = previousKey
    if (previousViteKey === undefined) delete process.env.VITE_NARA_API_KEY
    else process.env.VITE_NARA_API_KEY = previousViteKey
  })

  it('cron secret이 없으면 503을 반환한다', async () => {
    delete process.env.CRON_SECRET
    const response = await GET(new Request('http://localhost/api/cron/ingest'))
    expect(response.status).toBe(503)
  })

  it('cron authorization이 없거나 다르면 401을 반환한다', async () => {
    process.env.CRON_SECRET = 'secret'
    expect((await GET(new Request('http://localhost/api/cron/ingest'))).status).toBe(401)
    expect((await GET(new Request('http://localhost/api/cron/ingest', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401)
  })

  it('인증은 맞지만 API 키가 없으면 503을 반환한다', async () => {
    process.env.CRON_SECRET = 'secret'
    delete process.env.NARA_API_KEY
    delete process.env.VITE_NARA_API_KEY
    const response = await GET(new Request('http://localhost/api/cron/ingest', { headers: { authorization: 'Bearer secret' } }))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toContain('NARA_API_KEY')
  })
})
