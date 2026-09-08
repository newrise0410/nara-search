import { BIDPUBLIC_DIVS, BIDPUBLIC_PAGE_SIZE, bidPublicUrl, BSNS_DIV_NM, fetchPages, NaraApiError, noticeUrl, OPNSTD_PAGE_SIZE, MAX_PAGES } from '@nara/api'
import type { BidPublicRow, FetchPagesResult, NoticeRow } from '@nara/api'
import type { NaraDb } from '@nara/db'
import { upsertNoticePage, upsertNoticePageLive } from '../upsert'
import type { IngestChunk } from './types'

/** 이 코드가 오면 입찰공고정보서비스를 쓸 수 없다고 보고 표준서비스로 폴백한다 */
export const NOTICE_FALLBACK_CODES: readonly string[] = ['12', '20', '22', '30', '31', '32']

export async function ingestNoticeChunk(c: IngestChunk): Promise<FetchPagesResult> {
  const pageTransaction = c.pageTransaction
  const standard = () => fetchPages<NoticeRow>(noticeUrl(c.chunkStart, c.chunkEnd), {
    pageSize: OPNSTD_PAGE_SIZE, maxPages: MAX_PAGES.notice, startPage: c.startPage, signal: c.signal, shouldContinue: c.shouldContinue,
    onPage: async (rows, meta) => {
      const persist = async (db: NaraDb) => { await upsertNoticePage(db, rows); await c.onCheckpoint(meta, rows.length) }
      if (pageTransaction) await pageTransaction(persist); else await persist(c.db)
    },
  })
  /** 빈 biz_div 레거시 잡은 기존 표준서비스 체크포인트를 그대로 이어간다. */
  const div = BIDPUBLIC_DIVS.find((d) => d === c.bizDiv)
  if (!div) return standard()

  let ingested = 0
  try {
    return await fetchPages<BidPublicRow>(bidPublicUrl(div, c.chunkStart, c.chunkEnd), {
      pageSize: BIDPUBLIC_PAGE_SIZE, maxPages: MAX_PAGES.notice, startPage: c.startPage, signal: c.signal, shouldContinue: c.shouldContinue,
      onPage: async (rows, meta) => {
        const persist = async (db: NaraDb) => {
          rows.forEach((row) => { row.bsnsDivNm ??= BSNS_DIV_NM[div] })
          await upsertNoticePageLive(db, rows)
          await c.onCheckpoint(meta, rows.length)
          ingested += rows.length
        }
        if (pageTransaction) await pageTransaction(persist); else await persist(c.db)
      },
    })
  } catch (error) {
    if (ingested === 0 && c.startPage === 1 && error instanceof NaraApiError && NOTICE_FALLBACK_CODES.includes(error.code)) {
      c.onNote?.(`입찰공고정보서비스 폴백(${div}): ${error.message}`)
      return standard()
    }
    throw error
  }
}
