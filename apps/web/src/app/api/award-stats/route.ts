import { MissingDatabaseUrlError, getDb } from '@/server/db'
import { loadAwardStats } from '@/server/award-stats'
import { guardApi } from '@/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// GET /api/award-stats?agencyCode=&bizDivKey=&amount=&awardMethod=
export async function GET(request: Request): Promise<Response> {
  const denied = await guardApi()
  if (denied) return denied
  const params = new URL(request.url).searchParams
  const amountRaw = params.get('amount')
  const amount = amountRaw == null ? null : Number(amountRaw)
  if (amountRaw != null && (amount == null || !Number.isFinite(amount) || amount <= 0)) {
    return Response.json({ error: 'amount는 0보다 큰 숫자여야 합니다.' }, { status: 400 })
  }
  try {
    const stats = await loadAwardStats(getDb(), {
      agencyCode: params.get('agencyCode'),
      bizDivKey: params.get('bizDivKey'),
      amount,
      awardMethod: params.get('awardMethod'),
    })
    return Response.json({ stats }, { status: 200 })
  } catch (error) {
    const status = error instanceof MissingDatabaseUrlError ? 503 : 500
    if (status === 500) console.error(error)
    return Response.json({ error: messageOf(error) }, { status })
  }
}
