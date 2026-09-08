'use client'

import KeywordsView from '@/components/KeywordsView'
import { useHydrated } from '@/lib/useHydrated'

export default function Page() {
  return useHydrated() ? <KeywordsView /> : <div className="empty">불러오는 중</div>
}
