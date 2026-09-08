'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * zustand persist 재수화 전 SSR 마크업과의 불일치를 피하기 위한 가드.
 * 서버 스냅샷은 false, 클라이언트 스냅샷은 true — effect 안에서 setState를 부르지 않는다.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false)
}
