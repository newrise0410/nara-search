import { createDb } from '@nara/db'
import type { DbHandle, NaraDb } from '@nara/db'

/** DATABASE_URL 미설정 — 라우트가 503으로 변환한다 */
export class MissingDatabaseUrlError extends Error {
  constructor() { super('DATABASE_URL이 설정되지 않았습니다. apps/web/.env 또는 배포 환경변수에 지정하세요.') }
}

let handle: DbHandle | undefined
let override: NaraDb | undefined

/** 테스트에서 PGlite 핸들을 주입한다. undefined 를 넘기면 해제. 프로덕션에서는 무시한다 */
export function setDbForTesting(db: NaraDb | undefined): void {
  if (process.env.NODE_ENV === 'production') return
  override = db
}

/** 프로세스당 하나의 postgres-js 풀(max 3). 미설정이면 MissingDatabaseUrlError */
export function getDb(): NaraDb {
  if (override) return override
  if (handle) return handle.db
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new MissingDatabaseUrlError()
  handle = createDb(url, { max: 3 })
  return handle.db
}
