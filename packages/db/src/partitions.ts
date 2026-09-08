import { sql } from 'drizzle-orm'
import type { NaraDb } from './client'

export const PARTITIONED_TABLES = ['awards', 'bidders'] as const
export type PartitionedTable = (typeof PARTITIONED_TABLES)[number]

/** '2026-08-15' → '2026_08' */
export function monthKey(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error(`잘못된 날짜 형식: ${isoDate}`)
  return isoDate.slice(0, 7).replace('-', '_')
}

/** '2026-08-15' → { from: '2026-08-01', to: '2026-09-01' }  (to는 배타적 상한) */
export function monthRange(isoDate: string): { from: string; to: string } {
  monthKey(isoDate)
  const year = Number(isoDate.slice(0, 4)); const month = Number(isoDate.slice(5, 7))
  const nextYear = month === 12 ? year + 1 : year; const nextMonth = month === 12 ? 1 : month + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  return { from: `${year}-${pad(month)}-01`, to: `${nextYear}-${pad(nextMonth)}-01` }
}

/** 월별 파티션 생성은 DDL에 파라미터를 쓸 수 없어 검증한 날짜만 raw SQL에 넣는다. */
export async function ensurePartitions(db: NaraDb, isoDates: Iterable<string>): Promise<string[]> {
  const dates = new Map<string, string>()
  for (const isoDate of isoDates) dates.set(monthKey(isoDate), isoDate)
  const names: string[] = []
  for (const key of [...dates.keys()].sort()) {
    const range = monthRange(dates.get(key)!)
    for (const table of PARTITIONED_TABLES) {
      const name = `${table}_${key}`
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF "${table}" FOR VALUES FROM ('${range.from}') TO ('${range.to}')`))
      names.push(name)
    }
  }
  return names.sort()
}
