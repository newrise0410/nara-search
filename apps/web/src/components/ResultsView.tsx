'use client'

import { addMonths, applyProfile, download, isYmd, toCsv } from '@nara/api'
import type { Item } from '@nara/api'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactElement } from 'react'
import ResultsCards from '@/components/ResultsCards'
import ResultDetail from '@/components/ResultDetail'
import type { ResultLinkTarget } from '@/components/ResultDetail'
import ResultsTable from '@/components/ResultsTable'
import TopBarActions from '@/components/TopBarActions'
import { Icon } from '@/components/icons'
import { Empty, Kpi, Notice, PageHeader, Tag } from '@/components/ui'
import { fetchSearch, fetchStatus, searchKey, statusKey } from '@/lib/api-client'
import { awardStatsMapOf } from '@/lib/bid-range'
import { num, pct, won } from '@/lib/format'
import { toneForColor } from '@/lib/tag-color'
import { coverageLabel, useCoverage } from '@/lib/useCoverage'
import { useActiveProfile, useStore } from '@/store'

const KIND_LABEL = { award: '낙찰결과', notice: '입찰공고', prespec: '사전규격', contract: '계약' } as const
const BIZ_LABEL = { all: '전체', Thng: '물품', Servc: '용역', Cnstwk: '공사', Frgcpt: '외자' } as const

function estimatedAmountOf(item: Item): number | undefined {
  const prespecBudget = item.kind === 'prespec' ? item.amount : undefined
  return item.award?.estimatedPrice
    ?? item.notice?.estimatedPrice
    ?? item.notice?.budget
    ?? prespecBudget
    ?? item.contract?.amount
}

export default function ResultsView(): ReactElement {
  const router = useRouter()
  const query = useStore((state) => state.query)
  const page = useStore((state) => state.page)
  const sort = useStore((state) => state.sort)
  const setPage = useStore((state) => state.setPage)
  const setSort = useStore((state) => state.setSort)
  const setQuery = useStore((state) => state.setQuery)
  const setLastTotal = useStore((state) => state.setLastTotal)
  const addCompetitor = useStore((state) => state.addCompetitor)
  const profile = useActiveProfile()
  const { byKind } = useCoverage()
  const [searchInResults, setSearchInResults] = useState('')
  const [tag, setTag] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const pageSize = 50
  const args = { query, page, pageSize, sort }
  const { data, error, isPending } = useQuery({ queryKey: searchKey(args), queryFn: ({ signal }) => fetchSearch(args, signal), placeholderData: (previous) => previous })
  const awardStats = useMemo(() => awardStatsMapOf(data), [data])
  const { data: status } = useQuery({ queryKey: statusKey, queryFn: ({ signal }) => fetchStatus(signal), staleTime: 60_000, retry: false })
  const results = applyProfile(data?.items ?? [], profile)
  const list = useMemo(() => results.filter((item) => {
    const needle = searchInResults.trim().toLowerCase()
    const matchesText = !needle || `${item.title} ${item.agency} ${item.noticeNo} ${item.winner ?? ''}`.toLowerCase().includes(needle)
    const matchesTag = !tag || (tag === '__none' ? !item.tags?.length : item.tags?.includes(tag))
    return matchesText && matchesTag
  }), [results, searchInResults, tag])
  const tagCount = useMemo(() => {
    const counts = new Map<string, number>()
    results.forEach((item) => (item.tags ?? []).forEach((itemTag) => counts.set(itemTag, (counts.get(itemTag) ?? 0) + 1)))
    return counts
  }, [results])
  const estimatedValues = list.map(estimatedAmountOf)
  const knownEstimatedValues = estimatedValues.filter((value): value is number => value != null)
  const totalAmount = knownEstimatedValues.reduce((sum, value) => sum + value, 0)
  const hasEstimatedAmount = knownEstimatedValues.length > 0
  const rates = list.map((item) => item.awardRate).filter((value): value is number => value != null)
  const averageRate = rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : null
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const selected = selectedId ? list.find((item) => item.id === selectedId) : undefined
  const message = error instanceof Error ? error.message : error ? String(error) : ''
  const dataDate = status?.kinds.find((kind) => kind.kind === 'award')?.latestChunkStart ?? '-'
  const totalUntagged = results.filter((item) => !item.tags?.length).length
  const coverage = byKind[query.kind]
  const outsideCoverage = !coverage?.from || !coverage?.to || query.from < coverage.from || query.to > coverage.to

  useEffect(() => { setLastTotal(data?.total) }, [data?.total, setLastTotal])

  const csv = () => download(`nara-${Date.now()}.csv`, toCsv(list))
  const changeKind = (kind: typeof query.kind) => { setQuery({ kind }); setSelectedId(undefined) }
  const registerCompetitor = (bizNo: string, name: string) => addCompetitor({ bizNo, name })
  const openLinked = (target: ResultLinkTarget) => {
    const base = target.date && isYmd(target.date) ? target.date : undefined
    const range = !base ? {} : target.kind === 'notice'
      ? { from: base, to: base }
      : { from: addMonths(base, -6), to: base }
    setQuery({ kind: target.kind, keyword: target.keyword, source: 'db', ...range })
    setSelectedId(undefined); setSearchInResults(''); setTag('')
  }

  return (
    <>
      <TopBarActions>
        <button type="button" className="btn btn-ghost results-csv-action" aria-label="CSV 다운로드" onClick={csv}><Icon name="download" size={16} /><span className="action-label">CSV</span></button>
        <button type="button" className="btn btn-primary results-search-action" onClick={() => router.push('/search')}>조회</button>
      </TopBarActions>
      <PageHeader title="결과" count={`${list.length}`} sub={`${KIND_LABEL[query.kind]} · ${query.keyword || '전체'} · ${query.from === query.to ? query.from : `${query.from} ~ ${query.to}`}`} />
      <div className="row result-filter-row">
        {(['award', 'notice', 'prespec', 'contract'] as const).map((kind) => <button key={kind} type="button" className={`chip${query.kind === kind ? ' is-active' : ''}`} onClick={() => changeKind(kind)}>{KIND_LABEL[kind]}</button>)}
        <span className="divider" />
        <span className="chip chip-sm">기간 <span className="mono">{query.from === query.to ? query.from : `${query.from} ~ ${query.to}`}</span></span>
        <span className="chip chip-sm">업무구분 {BIZ_LABEL[query.bizDiv]}</span>
        <span className="chip chip-sm">프로필 {profile?.name ?? '없음'}</span>
        {data?.source === 'live' && data.live ? <span className="chip chip-sm">나라장터 실시간 · {data.live.requests}요청 · {(data.live.elapsedMs / 1000).toFixed(1)}초</span> : data?.source === 'nara-api' ? <span className="chip chip-sm">사전규격 실시간</span> : <span className="chip chip-sm">DB</span>}
        <span className="spacer" />
        <span className="muted">데이터 기준 {dataDate}</span>
      </div>
      <div className="row result-tools">
        <input className="input" value={searchInResults} onChange={(event) => setSearchInResults(event.target.value)} placeholder="결과 내 검색" style={{ maxWidth: 360 }} />
        <select className="select" value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(1) }} style={{ width: 160 }} aria-label="정렬">
          <option value="default">기본 순서</option><option value="amountDesc">금액 높은순</option><option value="amountAsc">금액 낮은순</option><option value="deadline">마감 임박순</option><option value="latest">최신순</option>
        </select>
        <div className="row result-tag-filters">
          <button type="button" className={`chip chip-sm${tag === '' ? ' is-active' : ''}`} onClick={() => setTag('')}>전체</button>
          {[...tagCount].map(([itemTag, count]) => <button type="button" key={itemTag} className={`chip chip-sm${tag === itemTag ? ' is-active' : ''}`} onClick={() => setTag(itemTag)}><Tag tone={toneForColor(profile?.categories.find((category) => category.name === itemTag)?.color)}>{itemTag} {count}</Tag></button>)}
          <button type="button" className={`chip chip-sm${tag === '__none' ? ' is-active' : ''}`} onClick={() => setTag('__none')}>미분류 {totalUntagged}</button>
        </div>
      </div>
      {isPending ? <Empty>조회 중</Empty> : null}
      {error ? <div className="err">오류: {message}</div> : null}
      {(data?.warnings ?? []).map((warning) => <div key={warning} className="err">{warning}</div>)}
      {data?.live?.truncated ? <Notice>결과가 예산 한도에서 잘렸습니다. 기간을 줄이거나 업무구분을 좁혀 다시 조회하세요.</Notice> : null}
      {!isPending && !error && data ? <>
        {query.source !== 'live' && !isPending && !error && data && data.total === 0 && outsideCoverage ? <Notice>
          이 기간은 DB에 없습니다 (DB 보유 {coverageLabel(byKind[query.kind])}).
          {query.kind === 'notice'
            ? <button type="button" className="btn-link" onClick={() => setQuery({ source: 'live' })}>나라장터 실시간으로 조회</button>
            : ' 수집이 끝나면 조회할 수 있습니다.'}
        </Notice> : null}
        <div className="grid-4">
          <Kpi label="결과" value={num(list.length)} unit="건" sub={`낙찰 확정 ${num(rates.length)}건 기준`} />
          <Kpi label="추정가격 합계" value={hasEstimatedAmount ? won(totalAmount) : '미정'} unit={hasEstimatedAmount ? '원' : undefined} />
          <Kpi label="평균 낙찰률" value={pct(averageRate)} sub={`낙찰 확정 ${num(rates.length)}건 기준`} />
          <Kpi label="분류"><div className="row result-kpi-tags">{[...tagCount].length ? [...tagCount].map(([itemTag, count]) => <Tag key={itemTag} tone={toneForColor(profile?.categories.find((category) => category.name === itemTag)?.color)}>{itemTag} {count}</Tag>) : <span className="faint">미분류</span>}</div></Kpi>
        </div>
        {list.length === 0 ? <Empty>조회 결과가 없습니다. 검색 화면에서 조건을 바꿔 보세요.</Empty> : <>
          <div className="hide-mobile"><ResultsTable items={list} profile={profile} awardStats={awardStats} selectedId={selectedId} onSelect={setSelectedId} /></div>
          <div className="show-mobile"><ResultsCards items={list} profile={profile} awardStats={awardStats} selectedId={selectedId} onSelect={setSelectedId} /></div>
          {selected ? <ResultDetail item={selected} profile={profile} stats={awardStats.get(selected.id)} onRegisterCompetitor={registerCompetitor} onOpenLinked={openLinked} /> : null}
        </>}
        <div className="row pagination">
          <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}>이전</button>
          <span className="spacer" /><span className="muted">{page} / {totalPages} · 총 {num(total)}건</span><span className="spacer" />
          <button type="button" className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(Math.min(totalPages, page + 1))}>다음</button>
        </div>
      </> : null}
    </>
  )
}
