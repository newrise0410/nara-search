import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'

export interface AuthUser { id: string; email: string }

let override: AuthUser | null | undefined

/** 테스트 주입. null = 확실히 미로그인, undefined = 실제 조회. 프로덕션에서는 무시한다 */
export function setAuthUserForTesting(user: AuthUser | null | undefined): void {
  if (process.env.NODE_ENV === 'production') return
  override = user
}

/** 로그인 사용자 또는 null. 이메일이 없는 계정은 null로 취급한다 */
export async function getOptionalUser(): Promise<AuthUser | null> {
  if (override !== undefined) return override
  try {
    const supabase = createClient(await cookies())
    const { data } = await supabase.auth.getUser()
    if (data.user?.id && data.user?.email) return { id: data.user.id, email: data.user.email }
    return null
  } catch (error) {
    console.error(error)
    return null
  }
}

/** 로그인 사용자 또는 401 응답. 절대 throw 하지 않는다 */
export async function requireUser(): Promise<{ user: AuthUser; denied?: undefined } | { user?: undefined; denied: Response }> {
  try {
    const user = await getOptionalUser()
    if (user) return { user }
    return { denied: Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }) }
  } catch (error) {
    console.error(error)
    return { denied: Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }) }
  }
}

/** 미로그인이면 401 JSON Response, 로그인 상태면 null. 절대 throw 하지 않는다 */
export async function guardApi(): Promise<Response | null> {
  const { denied } = await requireUser()
  return denied ?? null
}
