'use client'

import { monthsAgo, runPool, today } from '@nara/api'
import type { SearchKind } from '@nara/api'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import TopBarActions from '@/components/TopBarActions'
import AlertRulesCard from '@/components/AlertRulesCard'
import { Icon } from '@/components/icons'
import { Card, Empty, PageHeader } from '@/components/ui'
import { fetchSearch, fetchStatus, statusKey } from '@/lib/api-client'
import type { SearchResponse } from '@/lib/api-types'
import { mmdd } from '@/lib/format'
import { useStore } from '@/store'

const KEYWORD_SCOPES: { kind: SearchKind; months: number; label: string }[] = [
  { kind: 'award', months: 1, label: '낙찰' },
  { kind: 'notice', months: 3, label: '공고' },
  { kind: 'prespec', months: 3, label: '사전규격' },
]

interface KeywordReport { keyword: string; byKind: Record<SearchKind, number> }
interface Progress { done: number; total: number }

export default function KeywordsView(): ReactElement {
  const { keywords, addKeyword, removeKeyword, replaceQuery } = useStore()
  const router = useRouter()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState<Progress | null>(null)
  const [report, setReport] = useState<Record<string, KeywordReport>>({})
  const [error, setError] = useState<string>()
  const controller = useRef<AbortController | null>(null)
  const { data: status } = useQuery({ queryKey: statusKey, queryFn: ({ signal }) => fetchStatus(signal), staleTime: 60_000, retry: false })

  useEffect(() => () => controller.current?.abort(), [])

  const register = () => {
    const next = value.trim()
    if (!next) return
    addKeyword(next)
    setValue('')
  }

  const check = async () => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    const jobs = keywords.flatMap((keyword) => KEYWORD_SCOPES.map((scope) => ({ keyword, scope })))
    setError(undefined)
    setReport({})
    setBusy({ done: 0, total: jobs.length })
    try {
      const responses = await runPool<SearchResponse>(jobs.map(({ keyword, scope }) => () => fetchSearch({ query: { kind: scope.kind, keyword, from: monthsAgo(scope.months), to: today(), bizDiv: 'all' }, page: 1, pageSize: 1, sort: 'default' }, current.signal)), 4, (done, total) => setBusy({ done, total }), current.signal)
      if (controller.current !== current) return
      const next: Record<string, KeywordReport> = {}
      jobs.forEach(({ keyword, scope }, index) => {
        const item = next[keyword] ?? { keyword, byKind: { notice: 0, prespec: 0, award: 0, contract: 0 } }
        item.byKind[scope.kind] = responses[index].total
        next[keyword] = item
      })
      setReport(next)
      setBusy(null)
    } catch (caught) {
      if (controller.current === current) {
        setError(caught instanceof Error && caught.name === 'AbortError' ? '중단됨' : caught instanceof Error ? caught.message : String(caught))
        setBusy(null)
      }
    }
  }

  const stop = () => { controller.current?.abort(); controller.current = null; setBusy(null) }
  const openKeyword = (keyword: string) => {
    replaceQuery({ kind: 'notice', keyword, from: monthsAgo(3), to: today(), bizDiv: 'all' })
    router.push('/results')
  }
  const actionLabel = busy ? `점검 중 ${busy.done}/${busy.total}` : '키워드 점검'
  const awardDate = status?.kinds.find((kind) => kind.kind === 'award')?.latestChunkStart

  return (
    <>
      <TopBarActions><button type="button" className="btn btn-primary" disabled={Boolean(busy) || keywords.length === 0} onClick={check}>{actionLabel}</button>{busy ? <button type="button" className="btn btn-ghost" onClick={stop}>중단</button> : null}</TopBarActions>
      <PageHeader title="관심 키워드" sub="최대 30개 · 점검 시 유형별 최근 구간을 DB에서 대조합니다" />
      <Card pad="sm">
        <div className="row keyword-entry"><input className="input" value={value} placeholder="키워드 입력 후 Enter" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') register() }} /><button type="button" className="btn btn-ghost" onClick={register}>등록</button><span className="mono muted">{keywords.length}/30</span></div>
        <div className="muted keyword-meta">점검 시 요청 {keywords.length * 3}회 · 조달청 API 호출 없음</div>
        {keywords.length ? <div className="dtable keyword-table">
          <div className="dtable-head cols-keywords"><span>키워드</span><span>낙찰</span><span>공고</span><span>사전규격</span><span>기준</span><span /></div>
          {keywords.map((keyword) => {
            const item = report[keyword]
            return <div key={keyword} className="dtable-row cols-keywords">
              <button type="button" className="btn-link keyword-name" onClick={() => openKeyword(keyword)}>{keyword}</button>
              {KEYWORD_SCOPES.map((scope) => <span key={scope.kind} className={item ? 'mono' : 'faint'}>{item ? item.byKind[scope.kind] : '점검 전'}</span>)}
              <span className="muted">{item ? `낙찰 ${mmdd(awardDate)} 기준` : ''}</span>
              <button type="button" className="btn btn-icon btn-sm" aria-label="키워드 삭제" onClick={() => removeKeyword(keyword)}><Icon name="x" size={15} /></button>
            </div>
          })}
        </div> : <Empty>등록된 관심 키워드가 없습니다.</Empty>}
        {error ? <div className="err">오류: {error}</div> : null}
      </Card>
      <AlertRulesCard />
    </>
  )
}
