'use client'

import SettingsView from '@/components/SettingsView'
import { useHydrated } from '@/lib/useHydrated'

export default function Page() {
  return useHydrated() ? <SettingsView /> : <div className="empty">불러오는 중</div>
}
