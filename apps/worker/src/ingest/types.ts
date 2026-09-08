import type { PageMeta } from '@nara/api'
import type { NaraDb } from '@nara/db'

/** 페이지 업서트와 체크포인트를 한 트랜잭션으로 묶는다 (run.ts가 주입) */
export type PageTransaction = (work: (db: NaraDb) => Promise<void>) => Promise<void>

/** 잡 1건(청크)을 수집할 때 4개 ingest 모듈이 공통으로 받는 입력 */
export interface IngestChunk {
  db: NaraDb
  chunkStart: string
  chunkEnd: string
  bizDiv: string
  startPage: number
  signal?: AbortSignal
  shouldContinue: () => boolean
  onCheckpoint: (meta: PageMeta, rowsInPage: number) => Promise<void>
  pageTransaction?: PageTransaction
  /** true면 투찰행을 저장하지 않고 페이지 스트림을 메모리에서 접어 요약만 만든다 (award 전용) */
  summaryOnly?: boolean
  /** 폴백 등 운영 메모 — 잡의 error 컬럼에 남는다 */
  onNote?: (note: string) => void
}
