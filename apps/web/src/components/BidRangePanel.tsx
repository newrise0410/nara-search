'use client'

import type { ReactElement } from 'react'
import { Field, SectionTitle, Tag } from '@/components/ui'
import { BID_RANGE_DISCLAIMER, basisTextOf } from '@/lib/bid-range'
import type { BidRange } from '@/lib/bid-range'
import { pct, won } from '@/lib/format'

export interface BidRangePanelProps {
  range: BidRange
  /** 'award'면 '실제 낙찰률'을 함께 설명, 'notice'면 '아직 개찰 전' 문구 */
  kind: 'award' | 'notice'
}

export default function BidRangePanel({ range, kind }: BidRangePanelProps): ReactElement {
  return <section className="bid-range">
    <SectionTitle right={<Tag tone="gray">이력 분위수</Tag>}>추천 투찰 구간</SectionTitle>
    <div className="grid-4">
      <Field label="추천 구간(투찰율)"><span className="mono">{pct(range.from)} ~ {pct(range.to)}</span></Field>
      <Field label="중앙값"><span className="mono">{pct(range.mid)}</span></Field>
      <Field label="이력 하한율(중앙값)"><span className="mono">{pct(range.lowerLimitP50)}</span></Field>
      <Field label="추정가격 기준 환산">{range.amount
        ? <span className="mono">{won(range.amount.from)} ~ {won(range.amount.to)}원</span>
        : <span className="faint">추정가격 없음</span>}</Field>
    </div>
    <div className="bid-range-bar" role="img" aria-label={`추천 투찰 구간 ${pct(range.from)}부터 ${pct(range.to)}까지`}>
      <div className="bid-range-band" style={{ left: `${range.bar.start}%`, width: `${Math.max(range.bar.end - range.bar.start, 0.5)}%` }} />
      {range.bar.mid == null ? null : <span className="bid-range-mark" style={{ left: `${range.bar.mid}%` }} />}
      {range.bar.actual == null ? null : <span className="bid-range-mark is-actual" style={{ left: `${range.bar.actual}%` }} />}
    </div>
    <div className="bid-range-scale"><span className="mono">{pct(range.track.from)}</span><span className="mono">{pct(range.track.to)}</span></div>
    <div className="bid-range-basis muted">근거: {basisTextOf(range.basis)}</div>
    <div className="bid-range-basis faint">
      {BID_RANGE_DISCLAIMER}{kind === 'award' ? ' 파란 눈금은 이 건의 실제 투찰율입니다.' : ' 이 공고는 아직 개찰 전이며 구간은 같은 조건의 과거 낙찰 분포입니다.'}
    </div>
  </section>
}
