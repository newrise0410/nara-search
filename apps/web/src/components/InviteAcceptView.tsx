'use client'

import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { acceptInvite } from '@/lib/org-client'
import { useStore } from '@/store'

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

export default function InviteAcceptView({ token }: { token: string }): ReactElement {
  const started = useRef(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (started.current) return
    started.current = true
    void acceptInvite(token).then(() => {
      useStore.persist.clearStorage()
      window.location.assign('/dashboard')
    }).catch((caught: unknown) => setError(errorText(caught)))
  }, [token])

  return <div className="card"><div className="section-title">워크스페이스 초대</div>{error ? <><div className="err">오류: {error}</div><a className="btn btn-ghost" href="/dashboard">대시보드로 가기</a></> : <div>초대를 확인하는 중입니다.</div>}</div>
}
