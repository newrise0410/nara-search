import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DbHandle } from '@nara/db'
import { getOptionalUser, setAuthUserForTesting } from '@/server/auth'
import { getDb, MissingDatabaseUrlError, setDbForTesting } from '@/server/db'
import { makeDb, TEST_USER } from './helpers'

describe('테스트 주입 가드', () => {
  let handle: DbHandle | undefined

  afterEach(async () => {
    setDbForTesting(undefined)
    setAuthUserForTesting(undefined)
    vi.unstubAllEnvs()
    if (handle) await handle.close()
    handle = undefined
  })

  it('프로덕션에서는 setDbForTesting 주입이 무시된다', async () => {
    handle = await makeDb()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', '')
    setDbForTesting(handle.db)
    expect(() => getDb()).toThrow(MissingDatabaseUrlError)
    vi.unstubAllEnvs()
    setDbForTesting(handle.db)
    expect(getDb()).toBe(handle.db)
    setDbForTesting(undefined)
  })

  it('프로덕션에서는 setAuthUserForTesting 주입이 무시된다', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    setAuthUserForTesting(TEST_USER)
    expect(await getOptionalUser()).toBeNull()
    vi.unstubAllEnvs()
    setAuthUserForTesting(TEST_USER)
    expect(await getOptionalUser()).toEqual(TEST_USER)
    setAuthUserForTesting(undefined)
  })
})
