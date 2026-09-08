import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appUsers } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { GET as getSearch } from '@/app/api/search/route'
import { GET as getStatus } from '@/app/api/status/route'
import { GET as getCompetitors } from '@/app/api/competitors/route'
import { GET as getDashboard } from '@/app/api/dashboard/route'
import { GET as getCallback } from '@/app/auth/callback/route'
import { setAuthUserForTesting } from '@/server/auth'
import { setDbForTesting } from '@/server/db'
import { upsertAppUser } from '@/server/users'
import { makeDb, seedAll, TEST_USER } from './helpers'

describe('Google 인증', () => {
  let handle: DbHandle | undefined

  beforeEach(() => {
    setAuthUserForTesting(null)
  })

  afterEach(async () => {
    setAuthUserForTesting(undefined)
    setDbForTesting(undefined)
    if (handle) await handle.close()
    handle = undefined
  })

  it('미로그인이면 보호 API 4개가 401을 반환한다', async () => {
    const responses = await Promise.all([
      getSearch(new Request('http://localhost/api/search?kind=award&from=2026-08-01&to=2026-08-31')),
      getStatus(),
      getCompetitors(new Request('http://localhost/api/competitors')),
      getDashboard(new Request('http://localhost/api/dashboard')),
    ])
    for (const response of responses) {
      expect(response.status).toBe(401)
      expect((await response.json()).error).toBe('로그인이 필요합니다.')
    }
  })

  it('로그인 상태면 /api/status가 200을 반환한다', async () => {
    handle = await makeDb()
    await seedAll(handle.db)
    setDbForTesting(handle.db)
    setAuthUserForTesting(TEST_USER)
    const response = await getStatus()
    expect(response.status).toBe(200)
  })

  it('/auth/callback은 code가 없으면 /login?error=no_code로 보낸다', async () => {
    const response = await getCallback(new Request('http://localhost/auth/callback'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toMatch(/\/login\?error=no_code$/)
  })

  it('/auth/callback은 OAuth 오류 파라미터를 /login?error=oauth_error로 보낸다', async () => {
    const response = await getCallback(new Request('http://localhost/auth/callback?error=access_denied'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toMatch(/\/login\?error=oauth_error$/)
  })

  it('upsertAppUser가 이메일만 저장한다', async () => {
    handle = await makeDb()
    await upsertAppUser(handle.db, TEST_USER, new Date('2026-08-01T00:00:00.000Z'))
    const rows = await handle.db.select().from(appUsers)
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe(TEST_USER.email)
    expect(rows[0].id).toBe(TEST_USER.id)
  })

  it('upsertAppUser 재호출이 이메일과 마지막 로그인 시각만 갱신한다', async () => {
    handle = await makeDb()
    const firstSignIn = new Date('2026-08-01T00:00:00.000Z')
    const secondSignIn = new Date('2026-08-02T00:00:00.000Z')
    await upsertAppUser(handle.db, TEST_USER, firstSignIn)
    const first = (await handle.db.select().from(appUsers))[0]
    await upsertAppUser(handle.db, { ...TEST_USER, email: 'updated@example.com' }, secondSignIn)
    const rows = await handle.db.select().from(appUsers)
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('updated@example.com')
    expect(rows[0].createdAt).toEqual(first.createdAt)
    expect(rows[0].lastSignInAt).toEqual(secondSignIn)
  })
})
