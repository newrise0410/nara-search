import { fetchPages, PRESPEC_MAX_PAGES, PRESPEC_PAGE_SIZE, prespecUrl } from '@nara/api'
import type { FetchPagesResult, PrespecBizDiv, PrespecRow } from '@nara/api'
import type { NaraDb } from '@nara/db'
import { upsertPrespecPage } from '../upsert'
import type { IngestChunk } from './types'

export async function ingestPrespecChunk(c: IngestChunk): Promise<FetchPagesResult> {
  const pageTransaction = c.pageTransaction
  const bizDiv = c.bizDiv as PrespecBizDiv
  return fetchPages<PrespecRow>(prespecUrl(bizDiv, c.chunkStart, c.chunkEnd), {
    pageSize: PRESPEC_PAGE_SIZE, maxPages: PRESPEC_MAX_PAGES, startPage: c.startPage, signal: c.signal, shouldContinue: c.shouldContinue,
    onPage: async (rows, meta) => {
      const persist = async (db: NaraDb) => { await upsertPrespecPage(db, rows, bizDiv); await c.onCheckpoint(meta, rows.length) }
      if (pageTransaction) await pageTransaction(persist); else await persist(c.db)
    },
  })
}
