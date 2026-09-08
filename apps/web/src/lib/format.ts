import { isYmd } from '@nara/api'

/** 227,540,992 → '217MB'. 1024 기준. 1GB 이상만 소수 1자리. null/undefined → '-' */
export function bytes(value: number | null | undefined): string {
  if (value == null) return '-'
  const kb = 1024, mb = kb * 1024, gb = mb * 1024
  if (value < kb) return `${Math.round(value)}B`
  if (value < mb) return `${Math.round(value / kb)}KB`
  if (value < gb) return `${Math.round(value / mb)}MB`
  return `${(value / gb).toFixed(1)}GB`
}

/** 1324 → '1,324'. null/undefined → '-'. 외자 등 소수점 금액은 소수부가 있을 때만 소수점까지 표기된다(011). */
export function num(value: number | null | undefined): string {
  return value == null ? '-' : value.toLocaleString('en-US')
}

/** 62500000 → '62,500,000'. null/undefined → '-'. 외자 등 소수점 금액은 소수부가 있을 때만 소수점까지 표기된다(011). */
export function won(value: number | null | undefined): string {
  return num(value)
}

/** 88.153 → '88.15%'. null/undefined → '-' */
export function pct(value: number | null | undefined): string {
  return value == null ? '-' : `${value.toFixed(2)}%`
}

/** '2026-08-25' → '08-25'. 10자 미만이면 원본 */
export function mmdd(value: string | null | undefined): string {
  return value == null ? '-' : value.length >= 10 ? value.slice(5, 10) : value
}

/** '2026-08-25' → '2026-08-25 화요일' */
export function ymdWeekday(value: string): string {
  if (!isYmd(value)) return value
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  const weekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(date)
  return `${value} ${weekday}`
}

/** ISO 8601 → '08-25 03:00' (로컬 시간). null → '-' */
export function isoToMinute(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** gen.py의 numfmt 규칙으로 숫자부와 단위부를 나눈다 */
export function splitNumUnit(value: string): { number: string; unit: string } {
  const match = value.match(/^([0-9][0-9,]*(?:\.[0-9]+)?)(.*)$/)
  return match ? { number: match[1], unit: match[2] } : { number: '', unit: value }
}
