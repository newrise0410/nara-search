import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { authRedirect } from '@/lib/auth-routes'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

/** 요청마다 세션 쿠키를 갱신해 응답에 실어 보낸다. */
export const updateSession = async (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({ request: { headers: request.headers } })
  if (!supabaseUrl || !supabaseKey) return supabaseResponse // 미설정 환경에서는 통과

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  const target = authRedirect(request.nextUrl.pathname, request.nextUrl.search, Boolean(user))
  if (!target) return supabaseResponse
  const redirect = NextResponse.redirect(new URL(target, request.url))
  supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}
