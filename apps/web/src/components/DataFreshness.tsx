'use client'

import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { fetchStatus, statusKey } from '@/lib/api-client'

/** 사이드바 하단 수집 상태 카드 */
export default function DataFreshness(): ReactElement {
  const { data, isPending, isError } = useQuery({ queryKey: statusKey, queryFn: ({ signal }) => fetchStatus(signal), staleTime: 60_000, retry: false })
  if (isPending || isError || !data) {
    return <div className="sidebar-status"><div className="status-line"><span className="status-dot dot-gray" />점검 전</div><div className="status-detail">수집 이력을 확인할 수 없습니다</div><div className="status-next">다음 수집 03:00</div></div>
  }

  const award = data.kinds.find((kind) => kind.kind === 'award')
  const failed = data.kinds.reduce((sum, kind) => sum + kind.failed, 0)
  const pending = data.kinds.reduce((sum, kind) => sum + kind.pending, 0)
  if (failed > 0) {
    return <div className="sidebar-status"><div className="status-line"><span className="status-dot dot-red" />수집 실패</div><div className="status-detail">낙찰 {award?.latestChunkStart ?? '미수집'} · 실패 {failed}건</div><div className="status-next">다음 수집 03:00</div></div>
  }
  if (pending > 0) {
    return <div className="sidebar-status"><div className="status-line"><span className="status-dot dot-yellow" />수집 대기</div><div className="status-detail">낙찰 {award?.latestChunkStart ?? '미수집'} · 대기 {pending}건</div><div className="status-next">다음 수집 03:00</div></div>
  }
  return <div className="sidebar-status"><div className="status-line"><span className="status-dot dot-green" />수집 정상</div><div className="status-detail">낙찰 {award?.latestChunkStart ?? '미수집'} · 완료 {award?.done ?? 0}건</div><div className="status-next">다음 수집 03:00</div></div>
}
