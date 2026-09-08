import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { exchangeKakaoCode, loadNotifyEnv, seal } from 'worker'
import { originOf } from '@/lib/auth-routes'
import { requireUser } from '@/server/auth'
import { resolveContext } from '@/server/org'
import { getDb } from '@/server/db'
import { upsertKakaoChannel } from '@/server/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const redirectTo = (origin: string, value: string): NextResponse => NextResponse.redirect(new URL(`/settings?kakao=${value}`, origin), 307)
const clearState = (response: NextResponse): NextResponse => {
  response.cookies.set({ name: 'nara_kakao_state', value: '', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
  return response
}

export async function GET(request: Request): Promise<Response> {
  const origin = originOf(request)
  const auth = await requireUser()
  if (auth.denied) return NextResponse.redirect(new URL('/login?next=%2Fsettings', origin), 307)
  const params = new URL(request.url).searchParams
  const cookieState = (await cookies()).get('nara_kakao_state')?.value
  const error = params.get('error')
  if (error) return clearState(redirectTo(origin, 'denied'))
  if (!params.get('state') || params.get('state') !== cookieState) return clearState(redirectTo(origin, 'state_mismatch'))
  const code = params.get('code')
  if (!code) return clearState(redirectTo(origin, 'no_code'))

  const env = loadNotifyEnv()
  const exchangeEnv = { ...env, kakaoRedirectUri: env.kakaoRedirectUri || `${origin}/auth/kakao/callback` }
  let tokens
  try { tokens = await exchangeKakaoCode(code, exchangeEnv) } catch (exchangeError) {
    console.error(exchangeError)
    return clearState(redirectTo(origin, 'exchange_failed'))
  }
  if (!env.alertSecretKey) return clearState(redirectTo(origin, 'no_secret'))
  try {
    const config = {
      refreshToken: seal(tokens.refreshToken!, env.alertSecretKey),
      accessToken: seal(tokens.accessToken, env.alertSecretKey),
      expiresAt: tokens.expiresAt,
    }
    const db = getDb()
    const ctx = await resolveContext(db, auth.user)
    await upsertKakaoChannel(db, ctx, config)
    return clearState(NextResponse.redirect(new URL('/settings?kakao=connected', origin), 307))
  } catch (saveError) {
    console.error(saveError)
    return clearState(redirectTo(origin, 'exchange_failed'))
  }
}
