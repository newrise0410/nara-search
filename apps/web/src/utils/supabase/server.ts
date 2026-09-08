import { createServerClient } from '@supabase/ssr'
import type { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

/** 서버 컴포넌트·Route Handler용. `const supabase = createClient(await cookies())` */
export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) =>
  createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // 서버 컴포넌트에서 호출되면 쿠키를 쓸 수 없다. 미들웨어가 세션을 갱신하므로 무시해도 된다.
        }
      },
    },
  })
