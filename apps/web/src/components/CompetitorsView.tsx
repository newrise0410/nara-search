'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useState } from 'react'
import TopBarActions from '@/components/TopBarActions'
import { Icon } from '@/components/icons'
import { Card, Empty, Field, PageHeader } from '@/components/ui'
import { competitorsKey, fetchCompetitors } from '@/lib/api-client'
import { companyHref } from '@/lib/biz-no'
import { num, pct, won } from '@/lib/format'
import { useStore } from '@/store'

export default function CompetitorsView(): ReactElement {
  const { competitors, addCompetitor, removeCompetitor } = useStore()
  const [bizNo, setBizNo] = useState('')
  const [name, setName] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const bizNos = competitors.map((competitor) => competitor.bizNo)
  const { data, isPending, error } = useQuery({ queryKey: competitorsKey(bizNos), queryFn: ({ signal }) => fetchCompetitors(bizNos, signal), enabled: bizNos.length > 0 })
  const localNames = new Map(competitors.map((competitor) => [competitor.bizNo, competitor.name]))
  const stats = data?.items ?? []
  const loading = bizNos.length > 0 && isPending

  const register = () => {
    if (!name.trim()) return
    addCompetitor({ bizNo: bizNo.trim() || name.trim(), name: name.trim() })
    setBizNo('')
    setName('')
    setFormOpen(false)
  }

  return (
    <>
      <TopBarActions><button type="button" className="btn btn-primary" onClick={() => setFormOpen((open) => !open)}><Icon name="plus" size={16} />경쟁사 등록</button></TopBarActions>
      <PageHeader title="경쟁사" sub="사업자번호 기준으로 투찰 참여·낙찰·계약 실적을 집계합니다" />
      {formOpen ? <Card pad="sm" className="competitor-form"><div className="grid-2"><Field label="사업자번호"><input className="input" value={bizNo} placeholder="사업자번호" onChange={(event) => setBizNo(event.target.value)} /></Field><Field label="업체명"><input className="input" value={name} placeholder="업체명" onChange={(event) => setName(event.target.value)} /></Field></div><div className="row"><button type="button" className="btn btn-primary" onClick={register}>등록</button><button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>취소</button></div></Card> : null}
      {error ? <div className="err">오류: {error instanceof Error ? error.message : String(error)}</div> : null}
      <div className="dtable competitor-table">
        <div className="dtable-head cols-competitors"><span>업체</span><span>사업자번호</span><span className="cell-right">투찰 참여</span><span className="cell-right">낙찰</span><span className="cell-right">계약</span><span className="cell-right">낙찰·계약 금액</span><span className="cell-right">평균 낙찰률</span><span>주요 발주기관</span><span /></div>
        {loading ? <Empty>조회 중</Empty> : stats.length === 0 ? <Empty>등록된 경쟁사가 없습니다.</Empty> : stats.map((stat) => {
          const href = companyHref(stat.bizNo)
          return <div key={stat.bizNo} className="dtable-row cols-competitors">
            <span className="competitor-name"><strong>{href ? <Link href={href}>{stat.name || localNames.get(stat.bizNo) || ''}</Link> : stat.name || localNames.get(stat.bizNo) || ''}</strong><small className="muted">최근 {stat.lastSeen ?? '-'}</small></span>
            <span className="mono muted">{stat.bizNo}</span>
            <span className="mono cell-right">{num(stat.participated)}</span><span className="mono cell-right">{num(stat.won)}</span><span className="mono cell-right">{num(stat.contracts)}</span>
            <span className="mono cell-right">{won(stat.amount)}원</span>
            <span className="competitor-rate"><strong className="mono result-rate">{pct(stat.winRate)}</strong><small className="muted">투찰율 {pct(stat.bidRate)}</small></span>
            <span className="muted">{stat.agencies.join(', ') || '-'}</span>
            <button type="button" className="btn btn-icon btn-sm" aria-label="경쟁사 삭제" onClick={() => removeCompetitor(stat.bizNo)}><Icon name="x" size={15} /></button>
          </div>
        })}
      </div>
      <Card pad="lg"><div className="info-card"><span className="icon-box icon-gray"><Icon name="users" size={20} /></span><div className="col"><strong>결과 화면의 낙찰업체를 바로 등록할 수 있습니다</strong><span className="muted">낙찰 상세의 “낙찰업체를 경쟁사로 등록”을 누르면 사업자번호가 자동으로 채워집니다. 수집 범위가 넓어질수록 집계가 정확해집니다.</span></div></div></Card>
    </>
  )
}
