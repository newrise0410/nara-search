'use client'

import type { SearchKind } from '@nara/api'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { fetchStatus, statusKey } from './api-client'
import type { StatusCoverage } from './api-types'
import { useStore } from '@/store'

export interface CoverageMap { [kind: string]: StatusCoverage | undefined }

/**
 * /api/status 의 kind별 DB 보유 범위. 같은 statusKey를 쓰므로 TanStack Query가 중복 요청을 합친다.
 * 부수효과로 store.setCoverage(coverageTo)를 호출해 기본 조회 기간 계산에 쓰이게 한다.
 */
export function useCoverage(): { byKind: Partial<Record<SearchKind, StatusCoverage>>; isPending: boolean } {
  const setCoverage = useStore((state) => state.setCoverage)
  const { data, isPending } = useQuery({ queryKey: statusKey, queryFn: ({ signal }) => fetchStatus(signal), staleTime: 60_000, retry: false })
  useEffect(() => {
    if (!data) return
    setCoverage(Object.fromEntries(data.kinds.map((kind) => [kind.kind, kind.coverage.to]).filter(([, value]) => value)) as Partial<Record<SearchKind, string>>)
  }, [data, setCoverage])
  const byKind = Object.fromEntries(data?.kinds.map((kind) => [kind.kind, kind.coverage]) ?? []) as Partial<Record<SearchKind, StatusCoverage>>
  return { byKind, isPending }
}

/** {from:'2026-08-01',to:'2026-08-28'} → '08-01~08-28' · 같은 날이면 '08-25' · null이면 '없음' */
export function coverageLabel(coverage: StatusCoverage | undefined): string {
  if (!coverage?.from || !coverage.to) return '없음'
  const from = coverage.from.slice(5)
  const to = coverage.to.slice(5)
  return from === to ? from : `${from}~${to}`
}
