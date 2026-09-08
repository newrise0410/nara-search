'use client'

import { BIDPUBLIC_DIVS, BIZ_DIVS, addDays, addMonths, estimateLiveCalls, isRegNo, monthsAgo, today } from '@nara/api'
import type { SearchKind } from '@nara/api'
import { useRouter } from 'next/navigation'
import type { ReactElement } from 'react'
import TopBarActions from '@/components/TopBarActions'
import { Icon } from '@/components/icons'
import { Card, Field, Label, Notice, PageHeader, Segmented, Tag, Empty } from '@/components/ui'
import { coverageLabel, useCoverage } from '@/lib/useCoverage'
import { useActiveProfile, useStore } from '@/store'

const KINDS: readonly { value: SearchKind; label: string; hint: string }[] = [
  { value: 'award', label: '낙찰결과', hint: '낙찰: 개찰일 기준 · 하루 약 11만 투찰 행' },
  { value: 'notice', label: '입찰공고', hint: '공고: 공고일 기준 · DB 또는 나라장터 실시간' },
  { value: 'prespec', label: '사전규격', hint: '사전규격: 접수일 기준 · DB 미적재분은 실시간 조회' },
  { value: 'contract', label: '계약', hint: '계약: 계약체결일 기준 · 수집된 DB에서 조회' },
]

const QUICK_RANGES = [
  { label: '1일', days: 1 }, { label: '3일', days: 3 }, { label: '7일', days: 7 }, { label: '14일', days: 14 },
  { label: '1개월', months: 1 }, { label: '3개월', months: 3 }, { label: '6개월', months: 6 }, { label: '1년', months: 12 },
] as const

function hasBizDiv(kind: SearchKind, source: 'db' | 'live'): boolean {
  return kind === 'award' || kind === 'prespec' || (kind === 'notice' && source === 'live')
}

export default function SearchView(): ReactElement {
  const store = useStore()
  const profile = useActiveProfile()
  const { byKind } = useCoverage()
  const router = useRouter()
  const kind = KINDS.find((item) => item.value === store.query.kind) ?? KINDS[0]
  const dayCount = Math.round((new Date(store.query.to).getTime() - new Date(store.query.from).getTime()) / 864e5) + 1
  const showBiz = hasBizDiv(store.query.kind, store.query.source ?? 'db')
  const regNo = store.query.kind === 'prespec' && isRegNo(store.query.keyword)
  const bizOptions = [{ value: 'all' as const, label: '전체' }, ...BIZ_DIVS.map((item) => ({ value: item.id, label: item.label }))]
  const liveDivs = store.query.bizDiv === 'all' ? BIDPUBLIC_DIVS : [store.query.bizDiv]
  const liveCalls = estimateLiveCalls(store.query.from, store.query.to, liveDivs)
  const liveTooLong = store.query.to > addDays(addMonths(store.query.from, 12), -1)
  const liveNoKeyword = store.query.keyword.trim().length < 2
  const liveInvalid = store.query.source === 'live' && (liveTooLong || liveNoKeyword)

  const run = (keyword = store.query.keyword) => {
    if (store.query.source === 'live' && (liveTooLong || keyword.trim().length < 2)) return
    store.setQuery({ keyword })
    store.pushRecent(keyword)
    router.push('/results')
  }

  const quickActive = (range: typeof QUICK_RANGES[number]) => {
    if (store.query.to !== today()) return false
    if ('days' in range) return dayCount === range.days
    return store.query.from === monthsAgo(range.months)
  }

  return (
    <>
      <TopBarActions><button type="button" className="btn btn-primary search-top-action" disabled={liveInvalid} onClick={() => run()}>조회</button></TopBarActions>
      <PageHeader title="검색" sub="수집된 DB에서 조회합니다 · 입찰공고는 나라장터 실시간 조회 가능" />
      <Card pad="lg">
        <div className="row search-kind-row">
          <Segmented options={KINDS.map(({ value, label }) => ({ value, label }))} value={store.query.kind} onChange={(value) => store.setQuery({ kind: value })} ariaLabel="검색 유형" />
          <span className="spacer" />
          <span className="muted">{kind.hint}</span>
        </div>
        <div className="row">
          <Segmented ariaLabel="조회 소스" size="sm" value={store.query.source ?? 'db'} onChange={(value) => store.setQuery({ source: value })} options={[{ value: 'db', label: 'DB(빠름)' }, { value: 'live', label: '나라장터 실시간', disabled: store.query.kind !== 'notice' }]} />
        </div>
        <div className="search-fields" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <Field label="검색어"><input className="input" value={store.query.keyword} placeholder="사업명, 공고번호, 기관명" onChange={(event) => store.setQuery({ keyword: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') run() }} /></Field>
          <Field label="공고기관 (선택)"><input className="input" value={store.query.agency ?? ''} placeholder="공고기관 또는 수요기관" onChange={(event) => store.setQuery({ agency: event.target.value || undefined })} /></Field>
          {showBiz ? <Field label="업무구분"><Segmented options={bizOptions} value={store.query.bizDiv} onChange={(value) => store.setQuery({ bizDiv: value })} ariaLabel="업무구분" size="sm" /></Field> : <div />}
        </div>
        <div className="search-date-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, alignItems: 'end' }}>
          <Field label="시작일"><input className="input" type="date" value={store.query.from} onChange={(event) => store.setQuery({ from: event.target.value })} /></Field>
          <Field label="종료일"><input className="input" type="date" value={store.query.to} onChange={(event) => store.setQuery({ to: event.target.value })} /></Field>
          <Field label="빠른 기간"><div className="row search-chip-wrap">{QUICK_RANGES.map((range) => <button key={range.label} type="button" className={`chip chip-sm${quickActive(range) ? ' is-active' : ''}`} onClick={() => store.setQuery('days' in range ? { from: addDays(today(), -(range.days - 1)), to: today() } : { from: monthsAgo(range.months), to: today() })}>{range.label}</button>)}</div></Field>
        </div>
        {store.query.source === 'live' ? <>
          <div className="faint">조달청 API를 직접 호출합니다. 월×업무구분 단위로 요청하며 결과는 DB에도 저장됩니다.</div>
          <div className="muted">예상 요청 {liveCalls.min}회 (월 {liveCalls.months} × 업무구분 {liveDivs.length}, 결과가 많으면 최대 {liveCalls.max}회)</div>
          {liveTooLong ? <Notice>나라장터 실시간 조회는 최대 12개월까지 조회할 수 있습니다.</Notice> : null}
          {liveNoKeyword ? <Notice>나라장터 실시간 조회에는 검색어가 필요합니다.</Notice> : null}
        </> : null}
        <button type="button" className="btn btn-primary mobile-search-submit" disabled={liveInvalid} onClick={() => run()}>조회</button>
        <div className="row search-preset-row">
          <Label>프리셋</Label>
          {store.presets.map((preset) => <span key={preset.id} className="row"><button type="button" className="btn-link" onClick={() => store.replaceQuery(preset.query)}><Tag tone="blue">{preset.name}</Tag></button><button type="button" className="btn btn-icon btn-sm" aria-label="프리셋 삭제" onClick={() => store.removePreset(preset.id)}><Icon name="x" size={15} /></button></span>)}
          <button type="button" className="btn-link" onClick={() => { const name = prompt('프리셋 이름'); if (name?.trim()) store.addPreset(name.trim()) }}>+ 현재 조건 저장</button>
        </div>
        {regNo ? <div className="faint search-reg-note">숫자만 입력됨 · 사전규격등록번호로 직접 조회합니다 (기간 조건 무시)</div> : null}
      </Card>
      <div className="row faint">DB 보유: 낙찰 {coverageLabel(byKind.award)} · 공고 {coverageLabel(byKind.notice)} · 계약 {coverageLabel(byKind.contract)} · 사전규격 {coverageLabel(byKind.prespec)}</div>
      <div className="grid-2">
        <Card>
          <div className="row"><strong className="ink">최근 검색어</strong><span className="muted">최대 12개</span></div>
          <div className="row search-chip-wrap">{store.recent.length ? store.recent.map((recent) => <button type="button" key={recent} className="chip chip-sm" onClick={() => run(recent)}>{recent}</button>) : <Empty>아직 최근 검색어가 없습니다.</Empty>}</div>
        </Card>
        <Card>
          <div className="row"><strong className="ink">추천 검색어</strong>{profile ? <span className="muted">· {profile.name} 프로필</span> : null}</div>
          <div className="row search-chip-wrap">{[...new Set([...(profile?.defaultKeywords ?? []), ...store.keywords])].length ? [...new Set([...(profile?.defaultKeywords ?? []), ...store.keywords])].map((keyword) => <button type="button" key={keyword} className="chip chip-sm" onClick={() => run(keyword)}>{keyword}</button>) : <Empty>추천할 검색어가 없습니다.</Empty>}</div>
        </Card>
      </div>
    </>
  )
}
