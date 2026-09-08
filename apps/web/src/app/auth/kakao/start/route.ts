import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { kakaoAuthorizeUrl, loadNotifyEnv } from 'worker'
import { originOf } from '@/lib/auth-routes'
import { requireUser } from '@/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const auth = await requireUser()
  if (auth.denied) return auth.denied
  const env = loadNotifyEnv()
  const origin = originOf(request)
  if (!env.kakaoRestApiKey) return NextResponse.redirect(new URL('/settings?kakao=unconfigured', origin), 307)
  const state = randomUUID()
  const redirectUri = env.kakaoRedirectUri || `${origin}/auth/kakao/callback`
  const response = NextResponse.redirect(kakaoAuthorizeUrl({ ...env, kakaoRedirectUri: redirectUri }, state), 307)
  response.cookies.set({ name: 'nara_kakao_state', value: state, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 })
  return response
}
