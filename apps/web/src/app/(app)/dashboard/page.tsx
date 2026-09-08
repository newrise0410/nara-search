'use client'

import DashboardView from '@/components/DashboardView'
import { useHydrated } from '@/lib/useHydrated'

export default function Page() {
  return useHydrated() ? <DashboardView /> : <div className="empty">불러오는 중</div>
}
