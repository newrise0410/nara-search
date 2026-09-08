import { addDays, addMonths, isYmd, today } from '@nara/api'
import type { SearchKind } from '@nara/api'

/**
 * 유형별 기본 조회 기간.
 * - award   : DB 보유 마지막 날 하루(coverageTo). 없으면 어제 하루
 * - notice  : 최근 1개월
 * - contract: 최근 1주(오늘 포함 7일)
 * - prespec : 최근 1개월
 */
export function defaultRange(kind: SearchKind, coverageTo?: string | null): { from: string; to: string } {
  if (kind === 'award') {
    const date = isYmd(coverageTo) ? coverageTo : addDays(today(), -1)
    return { from: date, to: date }
  }
  if (kind === 'contract') return { from: addDays(today(), -6), to: today() }
  return { from: addMonths(today(), -1), to: today() }
}
