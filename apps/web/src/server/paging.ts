import type { Item } from '@nara/api'
import type { SearchPage, SearchParams, SearchSort } from '@/lib/api-types'

export function pageOf(items: Item[], p: SearchParams, total: number): SearchPage {
  return { items, page: p.page, pageSize: p.pageSize, total, hasMore: p.page * p.pageSize < total }
}

function compareNullable(a: number | undefined, b: number | undefined, direction: 1 | -1): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return (a - b) * direction
}

export function compareItems(a: Item, b: Item, sort: SearchSort): number {
  if (sort === 'amountDesc') {
    const amount = compareNullable(a.amount, b.amount, -1)
    if (amount) return amount
  } else if (sort === 'amountAsc') {
    const amount = compareNullable(a.amount, b.amount, 1)
    if (amount) return amount
  } else if (sort === 'deadline') {
    const deadline = compareText(a.deadline, b.deadline, 1)
    if (deadline) return deadline
  }
  const date = compareText(a.date, b.date, -1)
  return date || a.id.localeCompare(b.id)
}

function compareText(a: string | undefined, b: string | undefined, direction: 1 | -1): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a === b ? 0 : (a < b ? -1 : 1) * direction
}

/** 새 배열을 돌려준다(입력 불변) */
export function sortItems(items: Item[], sort: SearchSort): Item[] {
  return [...items].sort((a, b) => compareItems(a, b, sort))
}

/** 정렬이 끝난 전체 배열 → 요청 페이지 슬라이스 + total */
export function sliceItems(all: Item[], p: SearchParams): SearchPage {
  return pageOf(all.slice((p.page - 1) * p.pageSize, p.page * p.pageSize), p, all.length)
}
