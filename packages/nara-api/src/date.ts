/** 날짜 문자열(YYYY-MM-DD) 유틸. today()는 사용자 로컬 달력 기준, 산술은 UTC 자정 기준으로 일관 처리. */
const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => d.toISOString().slice(0, 10)
/** 로컬(KST 등) 달력 기준 오늘 — UTC 절단으로 하루 밀리는 문제 방지 */
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const compact = (s: string) => s.replace(/-/g, '')
export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
export const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
/** 월 가산 — 말일 넘침은 해당 월 말일로 클램프 (01-31 + 1개월 → 02-28) */
export const addMonths = (s: string, n: number) => {
  const d = new Date(s + 'T00:00:00Z'); const dom = d.getUTCDate()
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dom, last)); return iso(d)
}
export const monthsAgo = (n: number) => addMonths(today(), -n)
export const minDate = (a: string, b: string) => (a < b ? a : b)

/** [from,to]를 API 범위 제한 단위로 분할. 단위 경계 포함(예: day → 하루씩). */
export function chunkRange(from: string, to: string, unit: 'day' | 'week' | 'month'): [string, string][] {
  const out: [string, string][] = []
  let cur = from
  while (cur <= to) {
    const next = unit === 'day' ? cur : unit === 'week' ? addDays(cur, 6) : addDays(addMonths(cur, 1), -1)
    const end = minDate(next, to)
    out.push([cur, end])
    cur = addDays(end, 1)
  }
  return out
}
/** 날짜 내림차순 (동률 0, 2차 키 id) */
export const byDateDesc = <T extends { date: string; id: string }>(a: T, b: T) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1)
