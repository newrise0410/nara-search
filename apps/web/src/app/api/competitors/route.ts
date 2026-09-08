import { isYmd } from '@nara/api'
import { MissingDatabaseUrlError, getDb } from '@/server/db'
import { loadCompetitorStats, MAX_COMPETITORS } from '@/server/competitors'
import { guardApi } from '@/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function GET(request: Request): Promise<Response> {
  const denied = await guardApi()
  if (denied) return denied
  const params = new URL(request.url).searchParams
  const bizNos = params.getAll('bizNo')
  const from = params.get('from')?.trim()
  const to = params.get('to')?.trim()
  if (bizNos.length === 0 || bizNos.some((value) => !value.trim())) return Response.json({ error: 'bizNo가 필요합니다.' }, { status: 400 })
  if (bizNos.length > MAX_COMPETITORS) return Response.json({ error: `bizNo는 최대 ${MAX_COMPETITORS}개까지 입력할 수 있습니다.` }, { status: 400 })
  if ((from && !isYmd(from)) || (to && !isYmd(to))) return Response.json({ error: 'from과 to는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 })
  if (from && to && from > to) return Response.json({ error: 'from은 to보다 늦을 수 없습니다.' }, { status: 400 })
  try {
    const items = await loadCompetitorStats(getDb(), bizNos, { from, to })
    return Response.json({ items }, { status: 200 })
  } catch (error) {
    const status = error instanceof MissingDatabaseUrlError ? 503 : 500
    if (status === 500) console.error(error)
    return Response.json({ error: messageOf(error) }, { status })
  }
}
