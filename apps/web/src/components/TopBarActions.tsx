'use client'

import { createPortal } from 'react-dom'
import type { ReactElement, ReactNode } from 'react'
import { useEffect, useState } from 'react'

/** 상단바 우측 포털 호스트에 액션을 보낸다 */
export default function TopBarActions({ children }: { children: ReactNode }): ReactElement | null {
  const [host, setHost] = useState<Element | null>(null)

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setHost(document.getElementById('topbar-actions'))
  }, [])

  return host ? createPortal(children, host) : null
}
