'use client'

import { addDays, today } from '@nara/api'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import type { ReactElement } from 'react'
import { useState } from 'react'
import TopBarActions from '@/components/TopBarActions'
import { Icon } from '@/components/icons'
import { Card, Empty, Kpi, Num, PageHeader, SectionTitle, StatusDot, Notice } from '@/components/ui'
import { DASHBOARD_DEFAULTS, dashboardKey, fetchDashboard } from '@/lib/api-client'
import { isoToMinute, mmdd, num, won, ymdWeekday } from '@/lib/format'
import { useActiveProfile, useStore } from '@/store'

const SOURCE_LABELS = { notice: '입찰공고', award: '낙찰', contract: '계약', prespec: '사전규격' } as const

const FALLBACK_SOURCES = [
  { kind: 'notice', state: 'waiting', latestChunkStart: null, lastDoneAt: null, rows: 0, pending: 0, failed: 0, done: 0 },
  { kind: 'award', state: 'waiting', latestChunkStart: null, lastDoneAt: null, rows: 0, pending: 0, failed: 0, done: 0 },
  { kind: 'contract', state: 'waiting', latestChunkStart: null, lastDoneAt: null, rows: 0, pending: 0, failed: 0, done: 0 },
  { kind: 'prespec', state: 'realtime', latestChunkStart: null, lastDoneAt: null, rows: 0, pending: 0, failed: 0, done: 0 },
] as const

function greeting(): string {
  const hour = new Date().getHours()
  return hour < 12 ? '좋은 아침입니다' : hour < 18 ? '좋은 오후입니다' : '좋은 저녁입니다'
}

function deadlineTime(value: string | null): string {
  return value ? value.slice(5, 16) : '-'
}

function isNearDeadline(value: string | null): boolean {
  if (!value) return false
  const date = value.slice(0, 10)
  return date === today() || date === addDays(today(), 1)
}

function sourceDescription(source: { state: string; latestChunkStart: string | null; rows: number; failed: number }): string {
  if (source.state === 'ok') return `${source.latestChunkStart ?? '미수집'} · ${num(source.rows)}행 · 완료`
  if (source.state === 'failed') return `${source.latestChunkStart ?? '미수집'} · 실패 ${source.failed}건`
  if (source.state === 'realtime') return '실시간 조회로 대체'
  return '미수집 · 첫 수집 대기'
}

function sourceTone(state: string): 'green' | 'yellow' | 'red' | 'gray' {
  return state === 'ok' ? 'green' : state === 'failed' ? 'red' : state === 'realtime' ? 'yellow' : 'gray'
}

function LoadingKpis(): ReactElement {
  return <div className="grid-4"><div className="kpi hide-mobile"><Empty>불러오는 중</Empty></div><div className="kpi hide-mobile"><Empty>불러오는 중</Empty></div><div className="kpi"><Empty>불러오는 중</Empty></div><div className="kpi"><Empty>불러오는 중</Empty></div></div>
}

export default function DashboardView(): ReactElement {
  const router = useRouter()
  const keywords = useStore((state) => state.keywords)
  const activeProfile = useActiveProfile()
  const [noticeOpen, setNoticeOpen] = useState(false)
  const args = { keywords: keywords.slice(0, 10), profileKeywords: activeProfile?.defaultKeywords.slice(0, 10) ?? [], ...DASHBOARD_DEFAULTS }
  const { data, isPending, isError, error } = useQuery({ queryKey: dashboardKey(args), queryFn: ({ signal }) => fetchDashboard(args, signal), staleTime: 60_000, retry: false })

  const showAllDeadlines = () => {
    useStore.getState().replaceQuery({ kind: 'notice', keyword: '', from: today(), to: addDays(today(), 7), bizDiv: 'all' })
    router.push('/results')
  }
  /** 대시보드 숫자·행을 눌렀을 때 해당 조건으로 결과 화면을 연다 */
  const goResults = (query: { kind: 'award' | 'notice' | 'prespec' | 'contract'; keyword?: string; from: string; to: string }) => {
    useStore.getState().replaceQuery({ kind: query.kind, keyword: query.keyword ?? '', from: query.from, to: query.to, bizDiv: 'all' })
    router.push('/results')
  }
  const goSearch = (kind: 'award' | 'notice' | 'prespec' | 'contract') => {
    useStore.getState().setQuery({ kind })
    router.push('/search')
  }

  const award = data?.award
  const notice = data?.notice
  const keywordHits = data?.keywords.reduce((sum, item) => sum + item.count, 0) ?? 0
  const displayedKeywords = data?.keywords ?? (isError ? keywords.slice(0, 10).map((keyword) => ({ keyword, count: 0 })) : [])
  const displayedSources = data?.sources ?? FALLBACK_SOURCES
  const lastDone = award?.lastDoneAt
  const headerSub = `${ymdWeekday(today())} · ${lastDone ? `낙찰 데이터를 ${isoToMinute(lastDone)}에 갱신했습니다` : '아직 수집 이력이 없습니다'}`

  return (
    <>
      <TopBarActions>
        <button type="button" className="btn btn-ghost dashboard-alert-action" aria-label="알림 규칙" onClick={() => setNoticeOpen((open) => !open)}><Icon name="bell" size={16} /><span className="action-label">알림 규칙</span></button>
        <button type="button" className="btn btn-primary dashboard-new-search" onClick={() => router.push('/search')}>새 검색</button>
      </TopBarActions>
      <PageHeader title={greeting()} sub={headerSub} />
      {noticeOpen ? <Notice>알림 규칙은 관심 키워드 화면에서 설정할 수 있습니다.</Notice> : null}
      {isError ? <div className="err">대시보드 데이터를 불러오지 못했습니다. {error instanceof Error ? error.message : String(error)}</div> : null}
      {isPending ? <LoadingKpis /> : (
        <div className="grid-4">
          <div className="hide-mobile"><Kpi label={award?.date === addDays(today(), -1) ? '어제 개찰 낙찰' : '최근 개찰 낙찰'} value={award?.date ? num(award.notices) : '미수집'} unit={award?.date ? '건' : undefined} sub={award?.date ? <>투찰 {num(award.rows)}행 · {mmdd(award.date)} 개찰</> : '첫 수집 대기'} onClick={award?.date ? () => goResults({ kind: 'award', from: award.date!, to: award.date! }) : () => goSearch('award')} /></div>
          <div className="hide-mobile"><Kpi label="신규 입찰공고" value={notice?.date ? num(notice.count) : '미수집'} unit={notice?.date ? '건' : undefined} sub={notice?.date ? `${mmdd(notice.date)} 하루` : '첫 수집 대기'} onClick={notice?.date ? () => goResults({ kind: 'notice', from: notice.date!, to: notice.date! }) : () => goSearch('notice')} /></div>
          <Kpi label="관심 키워드 히트" value={isError ? '점검 전' : num(keywordHits)} unit={isError ? undefined : '건'} sub={isError ? '관심 키워드를 등록하세요' : `${data?.keywords.length ?? 0}개 키워드 · 낙찰 ${mmdd(data?.range.to)}`} onClick={() => router.push('/keywords')} />
          <Kpi label="마감 임박 공고" value={num(data?.deadlines.length ?? 0)} unit="건" sub={data?.deadlines.length ? `${args.deadlineDays}일 이내` : '공고 수집 대기'} onClick={showAllDeadlines} />
        </div>
      )}
      <div className="grid-main-aside">
        <Card>
          <SectionTitle right={<button type="button" className="btn-link" onClick={showAllDeadlines}>전체 보기</button>}>{`마감 임박${activeProfile ? ` · ${activeProfile.name} 프로필` : ''}`}</SectionTitle>
          {isPending ? <Empty>불러오는 중</Empty> : data?.deadlines.length ? (
            <>
              <div className="hide-mobile">
                <div className="dtable">
                  <div className="dtable-head cols-deadlines"><span>공고</span><span>기관</span><span>일정</span><span className="cell-right">추정가격</span></div>
                  {data.deadlines.map((deadline) => <div className="dtable-row cols-deadlines is-clickable" key={deadline.id} role="link" tabIndex={0} onClick={() => goResults({ kind: 'notice', keyword: deadline.noticeNo, from: addDays(today(), -60), to: addDays(today(), 30) })} onKeyDown={(event) => { if (event.key === 'Enter') goResults({ kind: 'notice', keyword: deadline.noticeNo, from: addDays(today(), -60), to: addDays(today(), 30) }) }}>
                    <span className="landing-mini-title" title={deadline.title}>{deadline.url ? <a href={deadline.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{deadline.title}</a> : deadline.title}</span>
                    <span className="muted">{deadline.agency}</span>
                    <span className={isNearDeadline(deadline.bidClose) ? 'err' : 'muted'}>입찰마감 {deadlineTime(deadline.bidClose)}</span>
                    <Num value={won(deadline.amount)} unit="원" className="cell-right" />
                  </div>)}
                </div>
              </div>
              <div className="show-mobile dashboard-deadline-list">
                {data.deadlines.map((deadline) => <div className="mcard is-clickable" key={deadline.id} role="link" tabIndex={0} onClick={() => goResults({ kind: 'notice', keyword: deadline.noticeNo, from: addDays(today(), -60), to: addDays(today(), 30) })}>
                  <strong className="ink">{deadline.url ? <a href={deadline.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{deadline.title}</a> : deadline.title}</strong>
                  <div className="row"><span className="muted">{deadline.agency}</span><span className={isNearDeadline(deadline.bidClose) ? 'err' : 'muted'}>입찰마감 {deadlineTime(deadline.bidClose)}</span></div>
                </div>)}
              </div>
            </>
          ) : <Empty>마감 임박 공고가 없습니다. 입찰공고 수집이 시작되면 여기에 표시됩니다.</Empty>}
        </Card>
        <div className="col">
          <Card pad="sm">
            <SectionTitle>관심 키워드</SectionTitle>
            {isPending ? <Empty>불러오는 중</Empty> : displayedKeywords.length ? displayedKeywords.map((item) => <div className="list-row is-clickable" key={item.keyword} role="link" tabIndex={0} onClick={() => goResults({ kind: 'award', keyword: item.keyword, from: data?.range.from ?? addDays(today(), -7), to: data?.range.to ?? today() })} onKeyDown={(event) => { if (event.key === 'Enter') goResults({ kind: 'award', keyword: item.keyword, from: data?.range.from ?? addDays(today(), -7), to: data?.range.to ?? today() }) }}><strong className="dashboard-keyword-name">{item.keyword}</strong><span className={isError ? 'faint' : ''}>{isError ? '점검 전' : `${item.count}건`}</span><span className="spacer" /><span className="muted">낙찰 {data ? mmdd(data.range.to) : '-'}</span></div>) : <><Empty>관심 키워드가 없습니다.</Empty><button type="button" className="btn-link" onClick={() => router.push('/keywords')}>키워드 등록</button></>}
          </Card>
          <Card pad="sm">
            <SectionTitle>데이터 소스</SectionTitle>
            {!isPending && (data?.stale?.length ?? 0) > 0
              ? <Notice>{data!.stale!.map((item) => `${SOURCE_LABELS[item.kind]} ${Math.floor(item.hoursSinceLastDone)}시간째 갱신 없음`).join(' · ')}</Notice>
              : null}
            {isPending ? <Empty>불러오는 중</Empty> : displayedSources.map((source) => <div className="list-row is-clickable" key={source.kind} role="link" tabIndex={0} onClick={() => goSearch(source.kind)} onKeyDown={(event) => { if (event.key === 'Enter') goSearch(source.kind) }}><StatusDot tone={isError ? 'gray' : sourceTone(source.state)} /><strong>{SOURCE_LABELS[source.kind]}</strong><span className="spacer" /><span className="mono muted">{isError ? '점검 전' : sourceDescription(source)}</span></div>)}
          </Card>
        </div>
      </div>
      <div className="show-mobile mobile-note muted">데이터 소스 상태는 더보기에서</div>
    </>
  )
}
