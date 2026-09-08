import { NaraApiError } from '@nara/api'
import { ParamError, parseSearchParams, searchItems } from '@/server/search'
import { MissingDatabaseUrlError, getDb } from '@/server/db'
import { MissingNaraKeyError } from '@/server/nara'
import { guardApi } from '@/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** 실시간 조회(source=live)는 조달청 API를 여러 번 호출한다. Vercel Hobby 한도 300 */
export const maxDuration = 300

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function GET(request: Request): Promise<Response> {
  const denied = await guardApi()
  if (denied) return denied
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const params = parseSearchParams(new URL(request.url).searchParams)
    const body = await searchItems(getDb(), params)
    return Response.json(body, { status: 200, headers })
  } catch (error) {
    const status = error instanceof ParamError ? 400
      : error instanceof MissingDatabaseUrlError ? 503
      : error instanceof MissingNaraKeyError ? 503
      : error instanceof NaraApiError ? 502
      : 500
    if (status === 500) console.error(error)
    return Response.json({ error: messageOf(error) }, { status, headers })
  }
}
