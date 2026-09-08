import { BSNS_DIV_NM } from '@nara/api'
import type { Item, PrespecBizDiv } from '@nara/api'
import type { AwardStatsBasis, AwardStatsResult, SearchAwardStats } from './api-types'
import { num } from './format'

/** 로드맵 요구: 예측이 아님을 명시한다. 패널 본문과 목록 칩 title에 같은 문장을 쓴다 */
export const BID_RANGE_DISCLAIMER = '과거 낙찰 이력의 분위수입니다. 예측이 아니며 투찰 결과를 보장하지 않습니다.'

/** 업무구분이 특정되지 않은 전체 셀(level 0)은 표시하지 않는다 */
export const MIN_BASIS_LEVEL = 1

/** 셀 조건 — server/award-stats.ts의 AwardStatsQuery와 같은 모양(순환 import를 피해 별도 선언) */
export interface AwardStatsCell {
  agencyCode: string | null
  bizDivKey: string | null
  amount: number | null
  awardMethod: string | null
}

/** '용역' → 'Servc'. 알 수 없는 라벨은 null */
export function bizDivKeyOf(label: string | null | undefined): PrespecBizDiv | null {
  const trimmed = label?.trim()
  if (!trimmed) return null
  const entry = Object.entries(BSNS_DIV_NM).find(([, value]) => value === trimmed)
  return entry ? entry[0] as PrespecBizDiv : null
}

/** 낙찰자결정방법을 award_stats 셀 키(짧은 표기)로 정규화한다. */
export function awardMethodKeyOf(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const first = trimmed.split('-')[0].trim()
  return first || null
}

/** 셀 매핑·금액 환산에 쓰는 추정가격. ResultsView.estimatedAmountOf와 같은 우선순위 */
export function estimatedPriceOf(item: Item): number | null {
  const value = item.award?.estimatedPrice ?? item.notice?.estimatedPrice ?? item.notice?.budget ?? null
  return value != null && value > 0 && Number.isFinite(value) ? value : null
}

/** 낙찰·공고 항목 → 셀 조건. 그 외 kind이거나 4축이 전부 비면 null */
export function awardStatsCellOf(item: Item): AwardStatsCell | null {
  if (item.kind !== 'award' && item.kind !== 'notice') return null
  const detail = item.award ?? item.notice
  if (!detail) return null
  const cell = {
    agencyCode: detail.agencyCode ?? null,
    bizDivKey: bizDivKeyOf(detail.bizDiv),
    amount: estimatedPriceOf(item),
    awardMethod: awardMethodKeyOf(detail.awardMethod),
  }
  return cell.agencyCode == null && cell.bizDivKey == null && cell.amount == null && cell.awardMethod == null ? null : cell
}

/** 표본이 충분하고(level ≥ MIN_BASIS_LEVEL, sufficient) 구간이 있는 셀인가 */
export function isDisplayableStats(stats: AwardStatsResult | null | undefined): boolean {
  return stats != null && stats.recommended != null && stats.basis.sufficient && stats.basis.level >= MIN_BASIS_LEVEL
}

/** 미니 바 좌표(0~100, 소수 2자리) */
export interface BidRangeBar { start: number; end: number; mid: number | null; actual: number | null }

export interface BidRange {
  /** 추천 구간(%) = rate.p25 */
  from: number
  /** 추천 구간(%) = rate.p75 */
  to: number
  /** rate.p50 */
  mid: number | null
  /** 셀 대표 낙찰하한율 중앙값(%) */
  lowerLimitP50: number | null
  /** 바 트랙 양끝(%) = p10~p90, 없으면 from~to */
  track: { from: number; to: number }
  /** 추정가격이 있을 때의 투찰금액 환산(원, 반올림). 없으면 null */
  amount: { from: number; to: number } | null
  bar: BidRangeBar
  basis: AwardStatsBasis
}

export interface BidRangeInput {
  /** 금액 환산용 추정가격 */
  estimatedPrice?: number | null
  /** 낙찰 확정 건의 실제 투찰율(%) — 바에 별도 눈금으로 찍는다 */
  actualRate?: number | null
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)
const round2 = (value: number): number => Math.round(value * 100) / 100

/** 표시 가능한 구간을 만든다. isDisplayableStats가 false면 null */
export function bidRangeOf(stats: AwardStatsResult | null | undefined, input: BidRangeInput = {}): BidRange | null {
  if (stats == null || !isDisplayableStats(stats) || stats.recommended == null) return null
  const from = stats.recommended.from
  const to = stats.recommended.to
  const track = { from: stats.rate.p10 ?? from, to: stats.rate.p90 ?? to }
  const span = track.to - track.from
  const at = (value: number): number => round2(span > 0 ? clamp(((value - track.from) / span) * 100, 0, 100) : 50)
  const estimatedPrice = input.estimatedPrice
  const amount = estimatedPrice != null && estimatedPrice > 0 && Number.isFinite(estimatedPrice)
    ? { from: Math.round(estimatedPrice * from / 100), to: Math.round(estimatedPrice * to / 100) }
    : null
  return {
    from,
    to,
    mid: stats.rate.p50,
    lowerLimitP50: stats.lowerLimitP50,
    track,
    amount,
    bar: {
      start: at(from),
      end: at(to),
      mid: stats.rate.p50 == null ? null : at(stats.rate.p50),
      actual: input.actualRate == null ? null : at(input.actualRate),
    },
    basis: stats.basis,
  }
}

/** 검색 응답 첨부를 item.id → 셀 Map으로 편다 */
export function awardStatsMapOf(source: { awardStats?: SearchAwardStats } | undefined): Map<string, AwardStatsResult> {
  const result = new Map<string, AwardStatsResult>()
  const attached = source?.awardStats
  if (!attached) return result
  for (const [itemId, index] of Object.entries(attached.byItem)) {
    const stats = attached.cells[index]
    if (stats) result.set(itemId, stats)
  }
  return result
}

/** '용역 · 10,000,000원~100,000,000원 · 소액수의견적 · 표본 1,054건 · 2025-09-01~2026-08-31 · 표본 부족으로 상위 기준 대체' */
export function basisTextOf(basis: AwardStatsBasis): string {
  const base = `${basis.label} · 표본 ${num(basis.n)}건 · ${basis.window.from}~${basis.window.to}`
  return basis.fallbackFrom.length > 0 ? `${base} · 표본 부족으로 상위 기준 대체` : base
}

/** 목록 칩 문구: '이력 구간 88.05~88.84%' */
export function bidRangeChipTextOf(range: BidRange): string {
  return `이력 구간 ${range.from.toFixed(2)}~${range.to.toFixed(2)}%`
}
