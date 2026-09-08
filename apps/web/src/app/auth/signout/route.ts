import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { originOf } from '@/lib/auth-routes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 사이드바의 로그아웃 폼 요청을 처리한다 */
export async function POST(request: Request): Promise<Response> {
  const supabase = createClient(await cookies())
  try {
    await supabase.auth.signOut()
  } catch (error) {
    console.error(error)
  }
  return NextResponse.redirect(new URL('/', originOf(request)), 303)
}
