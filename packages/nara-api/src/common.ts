/** 공공데이터포털(data.go.kr) 공통 응답 처리 */
import { today } from './date'
import { naraConfig } from './config'

export const ERROR_CODES: Record<string, string> = {
  '01': '제공기관 Application 오류', '02': '제공기관 DB 오류', '03': '데이터 없음', '04': '제공기관 HTTP 오류', '05': '제공기관 응답 시간 초과',
  '06': '날짜 형식 오류(YYYYMMDDHHMM)', '07': '입력범위 초과', '08': '필수값 누락', '10': 'ServiceKey 파라미터 없음', '11': '필수 요청 파라미터 없음',
  '12': '서비스가 없거나 폐기됨(URL 확인)', '20': '활용승인이 되지 않은 서비스', '22': '일일 트래픽 초과', '30': '등록되지 않은 서비스키(URL 인코딩 확인)',
  '31': '기한 만료된 서비스키', '32': '등록되지 않은 도메인/IP',
}

export class NaraApiError extends Error {
  code: string
  constructor(code: string, msg?: string) { super(`[${code}] ${ERROR_CODES[code] ?? msg ?? '알 수 없는 오류'}`); this.code = code }
}
export const abortError = () => new DOMException('Aborted', 'AbortError')

export interface Page<T> { items: T[]; totalCount?: number; pageNo: number; numOfRows?: number }

/** JSON 또는 (키 오류 시 내려오는) XML 응답을 모두 처리한다. */
export async function callApi<T>(url: string, signal?: AbortSignal): Promise<Page<T>> {
  const res = await (naraConfig().fetchImpl ?? globalThis.fetch)(url, { signal })
  const text = await res.text()
  let json: Record<string, unknown> | undefined
  try { json = JSON.parse(text) } catch { /* XML 오류 응답 */ }
  if (!json) {
    const code = /<returnReasonCode>(\d+)<\/returnReasonCode>/.exec(text)?.[1] ?? /<resultCode>(\d+)<\/resultCode>/.exec(text)?.[1]
    const msg = /<returnAuthMsg>([^<]*)<\/returnAuthMsg>/.exec(text)?.[1] ?? /<resultMsg>([^<]*)<\/resultMsg>/.exec(text)?.[1]
    throw new NaraApiError(code ?? String(res.status), msg ?? text.slice(0, 120))
  }
  // 실서버 응답 형태:
  //  정상  {"response":{"header":{resultCode},"body":{...}}}
  //  오류  {"nkoneps.com.response.ResponseError":{"header":{"resultCode":"07",...}}}
  //  게이트웨이 {"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"returnReasonCode":"30","returnAuthMsg":...}}}
  const gw = (json.OpenAPI_ServiceResponse as { cmmMsgHeader?: { returnReasonCode?: string; returnAuthMsg?: string; errMsg?: string } } | undefined)?.cmmMsgHeader
  if (gw) throw new NaraApiError(gw.returnReasonCode ?? String(res.status), gw.returnAuthMsg ?? gw.errMsg)
  const root = (json.response ?? Object.values(json).find((v) => v && typeof v === 'object' && 'header' in (v as object))) as { header?: { resultCode?: string; resultMsg?: string }; body?: Record<string, unknown> } | undefined
  if (!root || (!root.header && !root.body)) throw new NaraApiError(String(res.status), text.slice(0, 160))
  const r = root
  const code = r.header?.resultCode ?? '00'
  if (code === '03') return { items: [], totalCount: 0, pageNo: 1, numOfRows: 0 }
  if (code !== '00') throw new NaraApiError(code, r.header?.resultMsg)
  const body = r.body ?? {}
  const raw = body.items as unknown
  const items = (Array.isArray(raw) ? raw : raw && typeof raw === 'object' && 'item' in raw ? [(raw as { item: unknown }).item].flat() : []) as T[]
  const tc = Number(String(body.totalCount ?? '').replace(/[^\d]/g, ''))
  return { items, totalCount: body.totalCount == null ? undefined : tc, pageNo: Number(body.pageNo ?? 1), numOfRows: body.numOfRows == null ? undefined : Number(body.numOfRows) }
}

export interface PageMeta {
  pageNo: number
  totalCount?: number
  numOfRows?: number
}

export interface FetchPagesResult {
  /** 이번 호출에서 가져온 페이지 수 */
  pages: number
  /** 이번 호출에서 가져온 원본 행 수 누계 */
  rows: number
  /** 이번 호출에서 발생한 HTTP 요청 수 (= pages) */
  requests: number
  /** null이면 청크 완주. 숫자면 그 페이지부터 재개해야 함 */
  nextPage: number | null
  /** maxPages 소진으로 중단됐으면 true */
  truncated: boolean
  /** 첫 페이지 응답의 totalCount (없으면 undefined) */
  totalCount?: number
}

export interface FetchPagesOptions<T> {
  pageSize: number
  maxPages: number
  /** 기본 1. 체크포인트 재개용 */
  startPage?: number
  signal?: AbortSignal
  /** 페이지를 받을 때마다 호출. await 된다. 여기서 throw하면 fetchPages도 throw */
  onPage: (items: T[], meta: PageMeta) => Promise<void> | void
  /** false를 반환하면 그 페이지까지만 처리하고 nextPage를 채워 반환 */
  shouldContinue?: () => boolean
}

export async function fetchPages<T>(buildUrl: (pageNo: number) => string, opts: FetchPagesOptions<T>): Promise<FetchPagesResult> {
  const startPage = opts.startPage ?? 1
  let pages = 0
  let rows = 0
  let totalCount: number | undefined
  for (let pageNo = startPage; pages < opts.maxPages; pageNo++, pages++) {
    if (opts.signal?.aborted) throw abortError()
    const page = await callApi<T>(buildUrl(pageNo), opts.signal)
    rows += page.items.length
    if (pages === 0) totalCount = page.totalCount
    if (page.items.length > 0) await opts.onPage(page.items, { pageNo, totalCount: page.totalCount, numOfRows: page.numOfRows })
    if (page.items.length === 0) return { pages: pages + 1, rows, requests: pages + 1, nextPage: null, truncated: false, totalCount }
    const size = page.numOfRows || opts.pageSize
    if (page.totalCount != null && pageNo * size >= page.totalCount) return { pages: pages + 1, rows, requests: pages + 1, nextPage: null, truncated: false, totalCount }
    if (page.totalCount == null && page.items.length < size) return { pages: pages + 1, rows, requests: pages + 1, nextPage: null, truncated: false, totalCount }
    if (opts.shouldContinue?.() === false) return { pages: pages + 1, rows, requests: pages + 1, nextPage: pageNo + 1, truncated: false, totalCount }
  }
  return { pages, rows, requests: pages, nextPage: startPage + pages, truncated: true, totalCount }
}

export interface AllResult<T> { items: T[]; truncated: boolean; requests: number }

/**
 * totalCount까지 페이지를 순회한다.
 * 종료: 빈 페이지 / totalCount 도달 / (totalCount 미상일 때만) 짧은 페이지. maxPages 소진 시 truncated=true.
 */
export async function fetchAll<T>(buildUrl: (pageNo: number) => string, opts: { pageSize: number; maxPages: number; signal?: AbortSignal; onRequest?: () => void }): Promise<AllResult<T>> {
  const out: T[] = []
  let requests = 0
  for (let p = 1; p <= opts.maxPages; p++) {
    if (opts.signal?.aborted) throw abortError()
    const page = await callApi<T>(buildUrl(p), opts.signal)
    requests++; opts.onRequest?.()
    out.push(...page.items)
    if (page.items.length === 0) return { items: out, truncated: false, requests }
    if (page.totalCount != null && out.length >= page.totalCount) return { items: out, truncated: false, requests }
    if (page.totalCount == null && page.items.length < (page.numOfRows || opts.pageSize)) return { items: out, truncated: false, requests }
  }
  return { items: out, truncated: true, requests }
}

/** 동시성 제한 실행 + 진행률 콜백. 첫 실패 또는 abort 시 남은 작업을 투입하지 않는다. */
export async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0, done = 0, failed: unknown
  const worker = async () => {
    while (next < tasks.length && failed === undefined) {
      if (signal?.aborted) { failed = abortError(); break }
      const i = next++
      try { results[i] = await tasks[i]() } catch (e) { failed = e; break }
      onProgress?.(++done, tasks.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  if (failed !== undefined) throw failed
  return results
}

/**
 * 청크 단위 메모리 캐시 (같은 세션 내 재조회 방지).
 * - 절단된 결과는 캐시하지 않음
 * - 종료일이 오늘 이후인 '미완결 청크'는 짧은 TTL(5분) — 당일 데이터가 계속 추가되므로
 */
interface Entry { value: AllResult<unknown>; at: number; final: boolean }
const cache = new Map<string, Entry>()
const LIVE_TTL = 5 * 60_000
export async function cached<T>(key: string, endDate: string, load: () => Promise<AllResult<T>>): Promise<AllResult<T>> {
  const hit = cache.get(key)
  if (hit && (hit.final || Date.now() - hit.at < LIVE_TTL)) return hit.value as AllResult<T>
  const v = await load()
  if (!v.truncated) cache.set(key, { value: v, at: Date.now(), final: endDate < today() })
  return v
}
export const clearCache = () => cache.clear()
export const cacheSize = () => cache.size

/** 숫자 파싱 — 소수점을 보존한다(외자 금액). JS number라 유효숫자 15자리를 넘는 금액은 이론상 손실이나 조 단위 실무에서는 발생하지 않는다 */
export const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : undefined }
export const day = (v: unknown) => {
  const s = String(v ?? '').trim()
  if (/^\d{8}/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return s ? s.slice(0, 10).replace(/\//g, '-') : ''
}
export const yn = (v: unknown) => String(v ?? '').trim().toUpperCase() === 'Y'
export const str = (v: unknown) => { const s = String(v ?? '').trim(); return s || undefined }
