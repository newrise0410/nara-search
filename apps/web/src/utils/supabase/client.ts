'use client'

import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

/** 브라우저(클라이언트 컴포넌트)용 */
export const createClient = () => createBrowserClient(supabaseUrl!, supabaseKey!)
