'use client'

import Link from 'next/link'
import type { ReactElement } from 'react'
import type { CompanyProfile } from '@/lib/api-types'
import { companyHref, hyphenBizNo } from '@/lib/biz-no'
import { num, pct, won } from '@/lib/format'
import { Card, Empty, Kpi, PageHeader, SectionTitle } from '@/components/ui'

export default function CompanyProfileView({ profile }: { profile: CompanyProfile }): ReactElement {
  const { totals, range } = profile
  const maxWon = Math.max(0, ...profile.months.map((month) => month.won))
  const companyMeta = [profile.ceo ? `대표 ${profile.ceo}` : null, profile.address, profile.tel].filter((value): value is string => value != null)

  return (
    <>
      <PageHeader
        title={profile.name || profile.plainBizNo}
        sub={<div className="company-head"><span className="mono">{hyphenBizNo(profile.plainBizNo) || profile.plainBizNo}</span>{companyMeta.length > 0 ? <div className="company-meta">{companyMeta.map((value, index) => <span key={`${value}-${index}`}>{index > 0 ? '· ' : ''}{value}</span>)}</div> : null}</div>}
      />

      <div className="grid-4">
        <Kpi label="낙찰" value={num(totals.won)} unit="건" sub={`${range.from} ~ ${range.to}`} />
        <Kpi label="낙찰 금액" value={won(totals.amount)} unit="원" />
        <Kpi label="낙찰 시 투찰율" value={pct(totals.avgWinRate)} sub="낙찰 건의 투찰율 평균" />
        <Kpi label="발주기관" value={num(totals.agencies)} unit="곳" sub={`최근 낙찰 ${totals.lastAwardDate ?? '-'}`} />
      </div>

      <Card>
        <SectionTitle>월별 낙찰 추이</SectionTitle>
        {profile.months.length === 0
          ? <Empty>이 구간에 낙찰 이력이 없습니다.</Empty>
          : <div className="company-trend">{profile.months.map((month) => <div key={month.month} className="company-trend-row">
            <span className="mono muted">{month.month}</span>
            <div className="usage-bar"><div className="usage-bar-fill" style={{ width: `${maxWon > 0 ? Math.round((month.won / maxWon) * 100) : 0}%` }} /></div>
            <span className="mono cell-right">{num(month.won)}건</span>
            <span className="mono cell-right">{won(month.amount)}원</span>
          </div>)}</div>}
      </Card>

      <Card>
        <SectionTitle>주요 발주기관 TOP 10</SectionTitle>
        {profile.agencies.length === 0
          ? <Empty>발주기관 집계가 없습니다.</Empty>
          : <div className="dtable"><div className="dtable-head cols-company-agencies"><span>기관</span><span className="cell-right">낙찰</span><span className="cell-right">금액</span></div>{profile.agencies.map((agency) => <div key={agency.agency} className="dtable-row cols-company-agencies"><span>{agency.agency}</span><span className="mono cell-right">{num(agency.won)}건</span><span className="mono cell-right">{won(agency.amount)}원</span></div>)}</div>}
      </Card>

      <Card>
        <SectionTitle>최근 낙찰 20건</SectionTitle>
        {profile.recent.length === 0
          ? <Empty>최근 낙찰 이력이 없습니다.</Empty>
          : <div className="dtable"><div className="dtable-head cols-company-awards"><span>공고 · 사업명</span><span>기관</span><span>구분</span><span className="cell-right">낙찰금액</span><span className="cell-right">낙찰률</span></div>{profile.recent.map((award) => <div key={award.id} className="dtable-row cols-company-awards">
            <span className="result-title"><strong>{award.title}</strong><span className="mono muted">{award.noticeNo} · {award.openingDate}</span></span>
            <span className="muted">{award.agency || '-'}</span>
            <span>{award.bizDiv || '-'}</span>
            <span className="mono cell-right">{award.amount == null ? '-' : `${won(award.amount)}원`}</span>
            <span className="mono cell-right">{pct(award.rate)}</span>
          </div>)}</div>}
      </Card>

      <Card>
        <SectionTitle>상위권 동반 노출 업체</SectionTitle>
        {profile.peers.length === 0
          ? <Empty>같은 공고 상위 3위에 함께 등장한 업체가 없습니다.</Empty>
          : <div className="dtable"><div className="dtable-head cols-company-peers"><span>업체</span><span>사업자번호</span><span className="cell-right">동반 노출</span></div>{profile.peers.map((peer) => {
            const href = companyHref(peer.bizNo)
            return <div key={peer.bizNo} className="dtable-row cols-company-peers"><span>{href ? <Link href={href}>{peer.name}</Link> : peer.name}</span><span className="mono muted">{peer.bizNo}</span><span className="mono cell-right">{num(peer.together)}건</span></div>
          })}</div>}
      </Card>

      <Card pad="sm"><div className="company-basis">투찰 상세는 7일만 보관하므로 이 화면의 지표는 <strong>낙찰 공고 헤더</strong>와 각 공고의 <strong>투찰 상위 3위 요약</strong>만을 근거로 합니다. “낙찰 시 투찰율”은 낙찰된 건의 투찰율 평균이고, “상위권 동반 노출”은 같은 공고 상위 3위에 함께 나온 횟수입니다(전체 투찰 참여 이력이 아닙니다). 상위 3위 노출 {profile.exposure.appearances}건 · 그중 낙찰 {profile.exposure.won}건 · 노출 시 투찰율 {pct(profile.exposure.avgRate)}. 집계 구간 {range.from} ~ {range.to}.</div></Card>
    </>
  )
}
