'use client'

import ProfilesView from '@/components/ProfilesView'
import { useHydrated } from '@/lib/useHydrated'

export default function Page() {
  return useHydrated() ? <ProfilesView /> : <div className="empty">불러오는 중</div>
}
