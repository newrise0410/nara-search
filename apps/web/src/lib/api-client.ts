import type { SearchQuery } from '@nara/api'
import type { CompetitorsResponse, DashboardResponse, SearchResponse, SearchSort, StatusResponse } from './api-types'

export interface SearchArgs { query: SearchQuery; page: number; pageSize: number; sort: SearchSort }

/** SearchArgs → '/api/search?…' 쿼리 문자열(선행 '?' 포함) */
export function searchQueryString(args: SearchArgs): string {
  const params = new URLSearchParams({
    kind: args.query.kind,
    from: args.query.from,
    to: args.query.to,
    bizDiv: args.query.bizDiv,
    page: String(args.page),
    pageSize: String(args.pageSize),
    sort: args.sort,
  })
  if (args.query.source === 'live') params.set('source', 'live')
  if (args.query.keyword) params.set('keyword', args.query.keyword)
  if (args.query.agency) params.set('agency', args.query.agency)
  return `?${params.toString()}`
}

/** TanStack Query 캐시 키 */
export const searchKey = (args: SearchArgs) => ['search', args] as const
export const statusKey = ['status'] as const
export const competitorsKey = (bizNos: string[]) => ['competitors', bizNos] as const

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  let body: unknown
  try { body = await response.json() } catch { body = undefined }
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : `HTTP ${response.status}`
    throw new Error(error)
  }
  return body as T
}

export async function fetchSearch(args: SearchArgs, signal?: AbortSignal): Promise<SearchResponse> {
  return fetchJson<SearchResponse>(`/api/search${searchQueryString(args)}`, signal)
}

export async function fetchStatus(signal?: AbortSignal): Promise<StatusResponse> {
  return fetchJson<StatusResponse>('/api/status', signal)
}

export async function fetchCompetitors(bizNos: string[], signal?: AbortSignal): Promise<CompetitorsResponse> {
  const params = new URLSearchParams()
  bizNos.forEach((bizNo) => params.append('bizNo', bizNo))
  return fetchJson<CompetitorsResponse>(`/api/competitors?${params.toString()}`, signal)
}

export interface DashboardArgs {
  keywords: string[]
  profileKeywords: string[]
  days: number
  deadlineDays: number
  limit: number
}

/** DashboardArgs → '/api/dashboard?…' 쿼리 문자열(선행 '?' 포함) */
export function dashboardQueryString(args: DashboardArgs): string {
  const params = new URLSearchParams()
  args.keywords.forEach((keyword) => params.append('keyword', keyword))
  args.profileKeywords.forEach((keyword) => params.append('profileKeyword', keyword))
  params.set('days', String(args.days))
  params.set('deadlineDays', String(args.deadlineDays))
  params.set('limit', String(args.limit))
  return `?${params.toString()}`
}

export const dashboardKey = (args: DashboardArgs) => ['dashboard', args] as const
export const DASHBOARD_DEFAULTS = { days: 1, deadlineDays: 7, limit: 5 } as const

export async function fetchDashboard(args: DashboardArgs, signal?: AbortSignal): Promise<DashboardResponse> {
  return fetchJson<DashboardResponse>(`/api/dashboard${dashboardQueryString(args)}`, signal)
}
