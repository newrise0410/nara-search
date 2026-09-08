import { BIDPUBLIC_DIVS, filterItems, searchBidPublic } from '@nara/api'
import { upsertNoticePageLive } from 'worker'
import type { NaraDb } from '@nara/db'
import type { SearchParams, SearchResponse } from '@/lib/api-types'
import { ensureNaraConfigured, MissingNaraKeyError } from './nara'
import { sliceItems, sortItems } from './paging'

/** 실시간 조회 1회의 시간 예산. 라우트 maxDuration(300s) 안에서 넉넉히 여유를 둔다 */
export const LIVE_BUDGET_MS = 60_000
/** 실시간 조회 최대 기간(개월) */
export const LIVE_MAX_MONTHS = 12

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function searchLive(db: NaraDb, p: SearchParams): Promise<SearchResponse> {
  if (!ensureNaraConfigured()) throw new MissingNaraKeyError()
  const startedAt = Date.now()
  const deadline = startedAt + LIVE_BUDGET_MS
  const divs = p.bizDiv === 'all' ? [...BIDPUBLIC_DIVS] : [p.bizDiv]
  const result = await searchBidPublic({ from: p.from, to: p.to, keyword: p.keyword, divs }, { deadline })
  const warnings = [...result.errors]
  let upserted = 0
  if (result.rows.length > 0) {
    try {
      upserted = await upsertNoticePageLive(db, result.rows)
    } catch (error) {
      warnings.push(`DB 저장 실패: ${messageOf(error)}`)
    }
  }
  const filtered = p.agency ? filterItems(result.items, { agency: p.agency }) : result.items
  const page = sliceItems(sortItems(filtered, p.sort), p)
  return {
    ...page,
    source: 'live',
    live: { requests: result.requests, chunks: result.chunks, elapsedMs: Date.now() - startedAt, truncated: result.truncated, upserted },
    ...(warnings.length ? { warnings } : {}),
  }
}
