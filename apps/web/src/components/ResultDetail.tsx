'use client'

import Link from 'next/link'
import { highlightRequirements } from '@nara/api'
import type { Item, Profile } from '@nara/api'
import type { ReactElement, ReactNode } from 'react'
import { useState } from 'react'
import type { AwardStatsResult } from '@/lib/api-types'
import BidRangePanel from '@/components/BidRangePanel'
import { Icon } from '@/components/icons'
import { Card, Field, Tag } from '@/components/ui'
import { companyHref } from '@/lib/biz-no'
import { bidRangeOf, estimatedPriceOf } from '@/lib/bid-range'
import { isoToMinute, pct, won } from '@/lib/format'

/** 결과 화면 안에서 다른 유형으로 이동할 대상. date는 기준일(YYYY-MM-DD) */
export interface ResultLinkTarget { kind: 'notice' | 'prespec'; keyword: string; date?: string }

export interface ResultDetailProps {
  item: Item
  profile: Profile | undefined
  /** 016 추천 투찰 구간 셀. 없으면 패널을 그리지 않는다 */
  stats: AwardStatsResult | undefined
  onRegisterCompetitor: (bizNo: string, name: string) => void
  onOpenLinked: (target: ResultLinkTarget) => void
}

const KIND_LABEL = { award: '낙찰', notice: '공고', prespec: '사전규격', contract: '계약' } as const

function Value({ children }: { children: ReactNode }): ReactElement {
  return <span>{children == null || children === '' ? '-' : children}</span>
}

export default function ResultDetail({ item, profile, stats, onRegisterCompetitor, onOpenLinked }: ResultDetailProps): ReactElement {
  const [biddersOpen, setBiddersOpen] = useState(false)
  const requirements = highlightRequirements(item.title, profile?.requirementKeywords ?? [])
  const award = item.award
  const notice = item.notice
  const detailHref = notice?.detailUrl ?? item.url
  const contract = item.contract
  const prespec = item.prespec
  const winnerHref = companyHref(item.winnerBizNo)
  const bidRange = bidRangeOf(stats, { estimatedPrice: estimatedPriceOf(item), actualRate: item.kind === 'award' ? award?.finalRate ?? null : null })

  return <Card accent>
    <div className="row detail-head"><strong>{KIND_LABEL[item.kind]}상세</strong><span className="muted">{item.noticeNo} · {item.title}</span><span className="spacer" />{item.kind === 'award' && item.winnerBizNo && item.winner ? <button type="button" className="btn-link" onClick={() => onRegisterCompetitor(item.winnerBizNo!, item.winner!)}>낙찰업체를 경쟁사로 등록</button> : null}</div>
    <div className="detail-divider" />
    {award ? <>
      <div className="grid-4">
        <Field label="낙찰업체">{winnerHref
          ? <Value><Link href={winnerHref}>{item.winner ?? '-'}</Link>{award.winnerCeo ? <> · <span className="muted">{award.winnerCeo}</span></> : null}</Value>
          : <Value>{award.winnerCeo ? `${item.winner ?? '-'} · ${award.winnerCeo}` : item.winner}</Value>}</Field>
        <Field label="예정가격"><span className="mono">{won(award.reservedPrice)}원</span></Field>
        <Field label="낙찰금액"><span className="mono">{won(award.finalAmount)}원</span></Field>
        <Field label="낙찰률"><span className="mono">{pct(award.finalRate)}</span></Field>
        <Field label="추정가격"><span className="mono">{won(award.estimatedPrice)}원</span></Field>
        <Field label="기초금액"><span className="mono">{won(award.baseAmount)}원</span></Field>
        <Field label="하한율"><span className="mono">{pct(award.lowerLimitRate)}</span></Field>
        <Field label="개찰일"><Value>{award.openingDate}{award.openingTime ? ` ${award.openingTime}` : ''}</Value></Field>
      </div>
      {award.bidders.length ? <>
        <button type="button" className="btn btn-ghost btn-sm detail-bidders-toggle" onClick={() => setBiddersOpen((open) => !open)}>{biddersOpen ? '투찰업체 접기' : `투찰업체 ${award.bidders.length}개`}</button>
        {biddersOpen ? <div className="dtable">
          <div className="dtable-head cols-bidders"><span>순위</span><span>업체</span><span>사업자번호</span><span className="cell-right">투찰금액</span><span className="cell-right">투찰율</span><span>결과</span><span>등록</span></div>
          {award.bidders.map((bidder, index) => {
            const href = companyHref(bidder.bizNo)
            return <div key={`${bidder.bizNo ?? bidder.name}-${index}`} className={`dtable-row cols-bidders${bidder.won ? ' is-winner' : ''}`}><span>{bidder.rank ?? '-'}</span><span>{href ? <Link href={href}>{bidder.name}</Link> : bidder.name}</span><span className="mono muted">{bidder.bizNo ?? '-'}</span><span className="mono cell-right">{won(bidder.amount)}원</span><span className="mono cell-right">{pct(bidder.rate)}</span><span>{bidder.won ? '낙찰' : bidder.disqualifiedReason ? `부적격: ${bidder.disqualifiedReason}` : bidder.result ?? '-'}</span><button type="button" className="btn-link" disabled={!bidder.bizNo} onClick={() => bidder.bizNo && onRegisterCompetitor(bidder.bizNo, bidder.name)}>등록</button></div>
          })}
        </div> : null}
      </> : null}
    </> : null}
    {notice ? <div className="grid-4">
      <Field label="입찰마감"><Value>{notice.bidClose}</Value></Field><Field label="개찰"><Value>{notice.opening}</Value></Field><Field label="참가등록 마감"><Value>{notice.qualificationDeadline}</Value></Field><Field label="예산"><span className="mono">{won(notice.budget)}원</span></Field>
      <Field label="계약방법"><Value>{notice.contractMethod}</Value></Field><Field label="낙찰자결정방법"><Value>{notice.awardMethod}</Value></Field><Field label="지역제한"><Value>{notice.regionLimit ? notice.regions ?? '있음' : '없음'}</Value></Field><Field label="업종제한"><Value>{notice.industryLimit ? notice.industries ?? '있음' : '없음'}</Value></Field>
    </div> : null}
    {notice ? <div className="grid-4">
      <Field label="공고 상세">{detailHref ? <a href={detailHref} target="_blank" rel="noreferrer">나라장터에서 보기</a> : <Value>{null}</Value>}</Field>
      <Field label="품명 분류"><Value>{notice.productClass}</Value></Field>
      <Field label="공고 종류"><Value>{notice.reNotice ? `${notice.noticeKind ?? '공고'} · 재공고` : notice.noticeKind}</Value></Field>
      <Field label="연계 사전규격">{notice.prespecNo
        ? <div className="prespec-link"><button type="button" className="btn-link" onClick={() => onOpenLinked({ kind: 'prespec', keyword: notice.prespecNo!, date: item.date })}>{notice.prespecNo}</button>{notice.prespecLinkedAt ? <span className="muted">전환 확인 {isoToMinute(notice.prespecLinkedAt)}</span> : null}</div>
        : <Value>{notice.prespecNo}</Value>}</Field>
      <div className="field"><div className="label">첨부문서</div><div className="col">{notice.attachments?.length
        ? notice.attachments.map((file, index) => <a key={file.url} href={file.url} target="_blank" rel="noreferrer"><Icon name="download" size={14} />{file.name ?? `첨부 ${index + 1}`}</a>)
        : <span className="faint">첨부 정보 없음{detailHref ? <> · <a href={detailHref} target="_blank" rel="noreferrer">나라장터 상세에서 확인</a></> : null}</span>}</div></div>
    </div> : null}
    {bidRange ? <BidRangePanel range={bidRange} kind={item.kind === 'award' ? 'award' : 'notice'} /> : null}
    {prespec ? <div className="grid-4">
      <Field label="의견마감"><Value>{prespec.opinionDeadline}</Value></Field><Field label="납품기한"><Value>{prespec.deliveryDeadline}{prespec.deliveryDays ? ` · ${prespec.deliveryDays}일` : ''}</Value></Field><Field label="참조번호"><Value>{prespec.refNo}</Value></Field><Field label="담당자"><Value>{prespec.officer}{prespec.officerTel ? ` · ${prespec.officerTel}` : ''}</Value></Field>
      <div className="field"><div className="label">규격서</div><div className="col">{prespec.specDocs.length ? prespec.specDocs.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer"><Icon name="download" size={14} />규격서 {index + 1}</a>) : <Value>없음</Value>}</div></div>
      <Field label="연계 공고번호">{prespec.convertedNotices?.length
        ? <div className="prespec-link">{prespec.convertedNotices.map((notice) => <button key={`${notice.bidNtceNo}-${notice.ord}`} type="button" className="btn-link" onClick={() => onOpenLinked({ kind: 'notice', keyword: notice.bidNtceNo, date: notice.noticeDate })}>{notice.title || notice.bidNtceNo}</button>)}</div>
        : <Value>{prespec.relatedNoticeNos.join(', ')}</Value>}</Field>
    </div> : null}
    {contract ? <div className="grid-4">
      <Field label="계약번호"><Value>{contract.contractNo}</Value></Field><Field label="계약기간"><Value>{contract.period}</Value></Field><Field label="계약금액"><span className="mono">{won(contract.amount)}원</span></Field><Field label="업체"><Value>{contract.company ?? item.winner}</Value></Field>
      <Field label="수의사유"><Value>{contract.privateReason}</Value></Field><Field label="통합계약번호"><Value>{contract.unifiedNo}</Value></Field><Field label="연계 공고번호"><Value>{contract.noticeNo}</Value></Field><Field label="담당"><Value>{contract.companyCeo}{contract.companyTel ? ` · ${contract.companyTel}` : ''}</Value></Field>
    </div> : null}
    {requirements.length ? <div className="row detail-requirements">{requirements.map((keyword) => <Tag key={keyword} tone="yellow">{keyword}</Tag>)}</div> : null}
  </Card>
}
