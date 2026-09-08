import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema'

/** postgres-js 인스턴스와 PGlite 인스턴스 양쪽이 대입 가능한 상위 타입 */
export type NaraDb = PgDatabase<PgQueryResultHKT, typeof schema>

export interface DbHandle { db: NaraDb; close: () => Promise<void> }

/**
 * drizzle `db.execute()`의 반환 형태는 드라이버마다 다르다.
 * postgres-js → RowList(배열), PGlite → { rows: [...] }.
 * 양쪽을 행 배열로 정규화한다.
 */
export function resultRows<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null | undefined)?.rows
  return Array.isArray(rows) ? rows as T[] : []
}

/** ./migrations 의 절대경로 (fileURLToPath 기반) */
export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations')

/** postgres-js 드라이버. opts.max 기본 4 */
export function createDb(url: string, opts?: { max?: number }): DbHandle {
  const client = postgres(url, { max: opts?.max ?? 4 })
  const db = drizzle(client, { schema, casing: 'snake_case' })
  return { db, close: async () => { await client.end() } }
}

/** 아직 적용되지 않은 마이그레이션을 범위 안에서 순서대로 적용한다 */
export async function applyMigrations(db: NaraDb, opts?: { to?: string }): Promise<string[]> {
  const journalText = await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8')
  const journal = JSON.parse(journalText) as { entries: { tag: string; when: number }[] }
  let entries = journal.entries

  if (opts?.to !== undefined) {
    const to = opts.to
    const matches = entries.filter((entry) => entry.tag === to || entry.tag.startsWith(to))
    if (matches.length !== 1) throw new Error(`--to 태그를 특정할 수 없습니다: ${to}`)
    entries = entries.filter((entry) => entry.when <= matches[0].when)
  }

  await db.execute(sql.raw('CREATE SCHEMA IF NOT EXISTS "drizzle"'))
  await db.execute(sql.raw('CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)'))
  const migrationRows = resultRows<{ created_at: number | string | bigint }>(
    await db.execute(sql`select created_at from "drizzle"."__drizzle_migrations" order by created_at desc limit 1`),
  )
  const lastAt = migrationRows.length > 0 ? Number(migrationRows[0].created_at) : -1
  const applied: string[] = []

  await db.transaction(async (tx) => {
    for (const entry of entries) {
      if (entry.when <= lastAt) continue
      const migrationText = await readFile(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf8')
      for (const statement of migrationText.split('--> statement-breakpoint')) {
        if (statement.trim()) await tx.execute(sql.raw(statement))
      }
      await tx.execute(sql`insert into "drizzle"."__drizzle_migrations" ("hash","created_at") values (${createHash('sha256').update(migrationText).digest('hex')}, ${entry.when})`)
      applied.push(entry.tag)
    }
  })

  return applied
}

/** 범위 지정 마이그레이션을 내부적으로 max:1 커넥션에서 실행한다 */
export async function runMigrations(url: string, opts?: { to?: string }): Promise<void> {
  const handle = createDb(url, { max: 1 })
  try {
    await applyMigrations(handle.db, opts)
  } finally {
    await handle.close()
  }
}
