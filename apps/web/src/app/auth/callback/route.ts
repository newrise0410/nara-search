import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { originOf, safeNextPath } from '@/lib/auth-routes'
import { getDb } from '@/server/db'
import { upsertAppUser } from '@/server/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Supabase OAuth 코드를 앱 세션으로 교환한다 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const origin = originOf(request)
  const next = safeNextPath(url.searchParams.get('next'))
  const redirect = (path: string) => NextResponse.redirect(new URL(path, origin), 307)

  if (url.searchParams.get('error')) return redirect('/login?error=oauth_error')
  const code = url.searchParams.get('code')
  if (!code) return redirect('/login?error=no_code')

  const supabase = createClient(await cookies())
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    console.error(error)
    return redirect('/login?error=exchange_failed')
  }
  if (data.user.email) {
    try {
      await upsertAppUser(getDb(), { id: data.user.id, email: data.user.email })
    } catch (error) {
      console.error('app_users upsert 실패', error)
    }
  }
  return redirect(next)
}
