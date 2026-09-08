'use client'

import type { Item } from '@nara/api'
import type { ReactElement } from 'react'
import { Tag } from '@/components/ui'
import { bidRangeChipTextOf, bidRangeOf } from '@/lib/bid-range'
import { mmdd, pct, won } from '@/lib/format'
import { toneForColor } from '@/lib/tag-color'
import type { ResultsTableProps } from './ResultsTable'

const KIND_LABEL = { award: '낙찰', notice: '공고', prespec: '사전규격', contract: '계약' } as const

function methodOf(item: Item): string {
  return [item.notice?.contractMethod ?? item.award?.contractMethod ?? item.contract?.contractMethod, item.notice?.awardMethod ?? item.award?.awardMethod].filter(Boolean).join(' · ') || '계약방법 미정'
}

export default function ResultsCards({ items, profile, awardStats, selectedId, onSelect }: ResultsTableProps): ReactElement {
  return <div className="result-cards">{items.map((item) => {
    const selected = item.id === selectedId
    const range = bidRangeOf(awardStats.get(item.id))
    return <button key={item.id} type="button" className={`mcard${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={() => onSelect(item.id)}>
      <div className="row"><Tag tone="blue">{KIND_LABEL[item.kind]}</Tag>{item.prespec?.convertedNotices?.length ? <Tag tone="blue">본공고 전환</Tag> : null}{(item.tags ?? []).map((itemTag) => <Tag key={itemTag} tone={toneForColor(profile?.categories.find((category) => category.name === itemTag)?.color)}>{itemTag}</Tag>)}<span className="spacer" /><span className="mono muted">{mmdd(item.date)}</span></div>
      <strong className="ink">{item.title}</strong>
      <span className="muted">{item.agency} · {methodOf(item)}{item.notice?.attachments?.length ? ` · 첨부 ${item.notice.attachments.length}` : ''}</span>
      <div className="row"><span className="mono result-card-amount">{won(item.amount)}원</span><span className="muted">{item.winner && item.awardRate != null ? `낙찰 · ${pct(item.awardRate)}` : '추정가격'}</span></div>
      {range ? <div className="row"><span className="mono muted result-bid-range">{bidRangeChipTextOf(range)}</span></div> : null}
    </button>
  })}</div>
}
