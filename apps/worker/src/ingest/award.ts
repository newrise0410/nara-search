import { awardUrl, fetchPages, MAX_PAGES, OPNSTD_PAGE_SIZE } from '@nara/api'
import type { AwardRow, FetchPagesResult, PrespecBizDiv } from '@nara/api'
import { day } from '@nara/api'
import type { NaraDb } from '@nara/db'
import { ensurePartitions } from '@nara/db'
import { addAwardRows, flushAwardSummaries, newAwardAccumulator } from '../summary'
import { upsertAwardPage } from '../upsert'
import type { IngestChunk } from './types'

export async function ingestAwardChunk(c: IngestChunk): Promise<FetchPagesResult> {
  const bizDiv = c.bizDiv as PrespecBizDiv
  if (c.summaryOnly) return ingestAwardSummaryChunk(c, bizDiv)
  const pageTransaction = c.pageTransaction
  return fetchPages<AwardRow>(awardUrl(bizDiv, c.chunkStart), {
    pageSize: OPNSTD_PAGE_SIZE, maxPages: MAX_PAGES.award, startPage: c.startPage, signal: c.signal, shouldContinue: c.shouldContinue,
    onPage: async (rows, meta) => {
      const persist = async (db: NaraDb) => { await ensurePartitions(db, rows.map((row) => day(row.opengDate)).filter(Boolean)); await upsertAwardPage(db, rows, bizDiv); await c.onCheckpoint(meta, rows.length) }
      if (pageTransaction) await pageTransaction(persist); else await persist(c.db)
    },
  })
}

/** --summary-only: 하루치 페이지를 전부 메모리 누적기에 접은 뒤 마지막에 awards만 업서트한다. */
async function ingestAwardSummaryChunk(c: IngestChunk, bizDiv: PrespecBizDiv): Promise<FetchPagesResult> {
  const acc = newAwardAccumulator()
  const result = await fetchPages<AwardRow>(awardUrl(bizDiv, c.chunkStart), {
    pageSize: OPNSTD_PAGE_SIZE, maxPages: MAX_PAGES.award, startPage: 1, signal: c.signal, shouldContinue: c.shouldContinue,
    onPage: async (rows, meta) => { addAwardRows(acc, rows); await c.onCheckpoint(meta, rows.length) },
  })
  if (result.nextPage !== null) {
    const reason = result.truncated ? `페이지 상한(${MAX_PAGES.award}페이지)에 도달해` : '예산 안에'
    throw new Error(`summary-only 청크(${c.chunkStart} ${bizDiv})가 ${reason} 끝나지 않음 — --budget-ms를 늘려라(무거운 날 실측 5400000). summary-only는 페이지 1부터 재시작하므로 재시도로는 진전이 없다.`)
  }
  const flushed = await flushAwardSummaries(c.db, acc, bizDiv)
  c.onNote?.(`summary-only ${flushed.awards}공고 요약 저장${flushed.skipped ? ` · 개찰일 없음 ${flushed.skipped}행 제외` : ''}`)
  return result
}
