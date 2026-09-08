'use client'

import ResultsView from '@/components/ResultsView'
import { useHydrated } from '@/lib/useHydrated'

export default function Page() {
  return useHydrated() ? <ResultsView /> : <div className="empty">불러오는 중</div>
}
