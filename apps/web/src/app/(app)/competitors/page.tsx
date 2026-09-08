'use client'

import CompetitorsView from '@/components/CompetitorsView'
import { useHydrated } from '@/lib/useHydrated'

export default function Page() {
  return useHydrated() ? <CompetitorsView /> : <div className="empty">불러오는 중</div>
}
