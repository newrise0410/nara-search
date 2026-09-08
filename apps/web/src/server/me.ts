import type { NaraDb, OrgContext } from '@nara/db'
import { requireUser } from '@/server/auth'
import { MissingDatabaseUrlError, getDb } from '@/server/db'
import { resolveContext } from '@/server/org'
import { ForbiddenError, InvalidBodyError, NotFoundError } from '@/server/user-data'
import { SendFailedError } from '@/server/alerts'

const headers = { 'Cache-Control': 'no-store' }
const SERVER_ERROR = '서버 오류가 발생했습니다.'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorResponse(error: unknown): Response {
  const status = error instanceof InvalidBodyError ? 400
    : error instanceof ForbiddenError ? 403
    : error instanceof NotFoundError ? 404
    : error instanceof SendFailedError ? 502
    : error instanceof MissingDatabaseUrlError ? 503
    : 500
  if (status === 500) {
    console.error(error)
    return Response.json({ error: SERVER_ERROR }, { status, headers })
  }
  return Response.json({ error: messageOf(error) }, { status, headers })
}

/** GET 계열: 인증 → getDb → 조직 컨텍스트 → load → 200 JSON. 오류는 상태코드로 매핑 */
export async function meRead<T>(load: (db: NaraDb, ctx: OrgContext) => Promise<T>): Promise<Response> {
  const { user, denied } = await requireUser()
  if (denied) return denied
  try {
    const db = getDb()
    const ctx = await resolveContext(db, user)
    return Response.json(await load(db, ctx), { status: 200, headers })
  } catch (error) {
    return errorResponse(error)
  }
}

/** 본문 없는 변경(DELETE): 인증 → 조직 컨텍스트 → run → 200 { ok: true } */
export async function meAction(run: (db: NaraDb, ctx: OrgContext) => Promise<void>): Promise<Response> {
  const { user, denied } = await requireUser()
  if (denied) return denied
  try {
    const db = getDb()
    const ctx = await resolveContext(db, user)
    await run(db, ctx)
    return Response.json({ ok: true }, { status: 200, headers })
  } catch (error) {
    return errorResponse(error)
  }
}

/** 본문 있는 변경(PUT): 위 + request.json() 파싱(실패 시 400) */
export async function meWrite(request: Request, save: (db: NaraDb, ctx: OrgContext, body: unknown) => Promise<void>): Promise<Response> {
  const { user, denied } = await requireUser()
  if (denied) return denied
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(new InvalidBodyError('요청 본문이 올바른 JSON이 아닙니다.'))
  }
  try {
    const db = getDb()
    const ctx = await resolveContext(db, user)
    await save(db, ctx, body)
    return Response.json({ ok: true }, { status: 200, headers })
  } catch (error) {
    return errorResponse(error)
  }
}

/** 본문 있는 변경 중 결과 JSON을 돌려줘야 하는 것(생성 등). */
export async function meCreate<T>(request: Request, run: (db: NaraDb, ctx: OrgContext, body: unknown) => Promise<T>): Promise<Response> {
  const { user, denied } = await requireUser()
  if (denied) return denied
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(new InvalidBodyError('요청 본문이 올바른 JSON이 아닙니다.'))
  }
  try {
    const db = getDb()
    const ctx = await resolveContext(db, user)
    const result = await run(db, ctx, body)
    return Response.json(result, { status: 200, headers })
  } catch (error) {
    return errorResponse(error)
  }
}
