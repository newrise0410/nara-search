'use client'

import SearchView from '@/components/SearchView'
import { useHydrated } from '@/lib/useHydrated'

export default function Page() {
  return useHydrated() ? <SearchView /> : <div className="empty">불러오는 중</div>
}
