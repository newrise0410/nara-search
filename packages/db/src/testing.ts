import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from './schema'
import { applyMigrations } from './client'
import type { DbHandle } from './client'

/** PGlite(메모리) + pg_trgm 확장 + ./migrations 적용된 DB. 테스트 전용 */
export async function createTestDb(opts?: { to?: string }): Promise<DbHandle> {
  const client = await PGlite.create({ extensions: { pg_trgm } })
  const db = drizzle(client, { schema, casing: 'snake_case' })
  await applyMigrations(db, opts)
  return { db, close: async () => { await client.close() } }
}
