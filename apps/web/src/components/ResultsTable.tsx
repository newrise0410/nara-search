'use client'

import type { Item, Profile } from '@nara/api'
import type { ReactElement } from 'react'
import { Num, Tag } from '@/components/ui'
import type { AwardStatsResult } from '@/lib/api-types'
import { BID_RANGE_DISCLAIMER, basisTextOf, bidRangeChipTextOf, bidRangeOf } from '@/lib/bid-range'
import { mmdd, pct, won } from '@/lib/format'
import { toneForColor } from '@/lib/tag-color'

export interface ResultsTableProps {
  items: Item[]
  profile: Profile | undefined
  /** item.id → 셀 통계(016). 없는 항목은 칩을 그리지 않는다 */
  awardStats: Map<string, AwardStatsResult>
  selectedId: string | undefined
  onSelect: (id: string) => void
}

function estimatedAmountOf(item: Item): number | undefined {
  const prespecBudget = item.kind === 'prespec' ? item.amount : undefined
  return item.award?.estimatedPrice
    ?? item.notice?.estimatedPrice
    ?? item.notice?.budget
    ?? prespecBudget
    ?? item.contract?.amount
}

function methodOf(item: Item): string {
  return [item.notice?.contractMethod ?? item.award?.contractMethod ?? item.contract?.contractMethod, item.notice?.awardMethod ?? item.award?.awardMethod].filter(Boolean).join(' · ') || '-'
}

function attachLabel(item: Item): string {
  const files = item.notice?.attachments ?? []
  const parts: string[] = []
  if (files.length) parts.push(`첨부 ${files.length}${files[0].name ? ` · ${files[0].name}` : ''}`)
  if (item.notice?.lowerLimitRate != null) parts.push(`하한 ${pct(item.notice.lowerLimitRate)}`)
  return parts.join(' · ')
}

function bizDivOf(item: Item): string {
  return item.notice?.bizDiv ?? item.award?.bizDiv ?? item.contract?.bizDiv ?? item.prespec?.bizDiv ?? '-'
}

export default function ResultsTable({ items, profile, awardStats, selectedId, onSelect }: ResultsTableProps): ReactElement {
  return (
    <div className="dtable">
      <div className="dtable-head cols-results"><span>공고 · 사업명</span><span>기관</span><span>구분 · 방법</span><span className="cell-right">추정가격</span><span className="cell-right">낙찰가 · 낙찰률</span><span>분류</span></div>
      {items.map((item) => {
        const selected = item.id === selectedId
        const estimatedAmount = estimatedAmountOf(item)
        const range = bidRangeOf(awardStats.get(item.id))
        const categoryColor = (name: string) => profile?.categories.find((category) => category.name === name)?.color
        return <button key={item.id} type="button" className={`dtable-row cols-results${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={() => onSelect(item.id)}>
          <span className="result-title"><strong>{item.title}</strong><span className="mono muted">{item.noticeNo} · {mmdd(item.date)}</span>{attachLabel(item) ? <small className="muted result-attach">{attachLabel(item)}</small> : null}{range ? <small className="muted result-bid-range mono" title={`${basisTextOf(range.basis)} · ${BID_RANGE_DISCLAIMER}`}>{bidRangeChipTextOf(range)}</small> : null}{item.prespec?.convertedNotices?.length ? <span className="prespec-link"><Tag tone="blue">본공고 전환{item.prespec.convertedNotices.length > 1 ? ` ${item.prespec.convertedNotices.length}` : ''}</Tag></span> : null}</span>
          <span>{item.agency}{item.demandAgency && item.demandAgency !== item.agency ? <small className="muted">수요 {item.demandAgency}</small> : null}</span>
          <span className="muted">{bizDivOf(item)} · {methodOf(item)}</span>
          {estimatedAmount == null ? <span className="faint cell-right">미정</span> : <Num value={won(estimatedAmount)} unit="원" className="cell-right" />}
          <span className="result-award">{item.winner && item.awardRate != null ? <>{item.amount == null ? <span className="faint">미정</span> : <Num value={won(item.amount)} unit="원" />}<span className="mono result-rate">{pct(item.awardRate)}</span></> : <span className="faint">미정</span>}</span>
          <span className="row result-tags">{(item.tags ?? []).map((itemTag) => <Tag key={itemTag} tone={toneForColor(categoryColor(itemTag))}>{itemTag}</Tag>)}</span>
        </button>
      })}
    </div>
  )
}
