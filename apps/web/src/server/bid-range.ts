import type { Item } from '@nara/api'
import type { NaraDb } from '@nara/db'
import type { SearchAwardStats } from '@/lib/api-types'
import { awardStatsCellOf, isDisplayableStats } from '@/lib/bid-range'
import { loadAwardStatsMany } from './award-stats'

/** 한 번의 검색에서 조회할 최대 셀 수. pageSize가 최대 500이라 상한을 둔다(초과 항목은 첨부 없음) */
export const MAX_STATS_CELLS = 80

function cellKeyOf(cell: { agencyCode: string | null; bizDivKey: string | null; amount: number | null; awardMethod: string | null }): string {
  return `${cell.agencyCode}\0${cell.bizDivKey}\0${cell.amount}\0${cell.awardMethod}`
}

/** 검색 결과에 붙일 추천 구간을 만든다. 붙일 셀이 없으면 undefined */
export async function attachAwardStats(db: NaraDb, items: Item[]): Promise<SearchAwardStats | undefined> {
  const cellsByKey = new Map<string, ReturnType<typeof awardStatsCellOf>>()
  for (const item of items) {
    const cell = awardStatsCellOf(item)
    if (cell) cellsByKey.set(cellKeyOf(cell), cell)
  }
  const selectedEntries = [...cellsByKey.entries()].slice(0, MAX_STATS_CELLS)
  if (selectedEntries.length === 0) return undefined

  const statsResults = await loadAwardStatsMany(db, selectedEntries.map(([, cell]) => cell!))
  const cells: SearchAwardStats['cells'] = []
  const indexByKey = new Map<string, number>()
  for (const [index, stats] of statsResults.entries()) {
    if (stats == null || !isDisplayableStats(stats)) continue
    const key = selectedEntries[index]?.[0]
    if (key == null) continue
    indexByKey.set(key, cells.length)
    cells.push(stats)
  }
  if (cells.length === 0) return undefined

  const byItem: Record<string, number> = {}
  for (const item of items) {
    const cell = awardStatsCellOf(item)
    if (!cell) continue
    const index = indexByKey.get(cellKeyOf(cell))
    if (index != null) byItem[item.id] = index
  }
  return { cells, byItem }
}
