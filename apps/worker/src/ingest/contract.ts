import { contractUrl, fetchPages, MAX_PAGES, OPNSTD_PAGE_SIZE } from '@nara/api'
import type { ContractRow, FetchPagesResult } from '@nara/api'
import type { NaraDb } from '@nara/db'
import { upsertContractPage } from '../upsert'
import type { IngestChunk } from './types'

export async function ingestContractChunk(c: IngestChunk): Promise<FetchPagesResult> {
  const pageTransaction = c.pageTransaction
  return fetchPages<ContractRow>(contractUrl(c.chunkStart, c.chunkEnd), {
    pageSize: OPNSTD_PAGE_SIZE, maxPages: MAX_PAGES.contract, startPage: c.startPage, signal: c.signal, shouldContinue: c.shouldContinue,
    onPage: async (rows, meta) => {
      const persist = async (db: NaraDb) => { await upsertContractPage(db, rows); await c.onCheckpoint(meta, rows.length) }
      if (pageTransaction) await pageTransaction(persist); else await persist(c.db)
    },
  })
}
